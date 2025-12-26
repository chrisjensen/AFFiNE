import { Injectable, Logger } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { applyUpdate, Doc as YDoc, Map as YMap, Text as YText } from 'yjs';

import { DocIsInTrash } from '../../base/error';
import { Models } from '../../models';
import { AccessController } from '../permission';
import { WorkspaceBlobStorage } from '../storage';

export interface MoveDocToWorkspaceInput {
  sourceWorkspaceId: string;
  docId: string;
  targetWorkspaceId: string;
  targetSpaceId?: string | null;
  moveLinkedDocs: boolean;
  linkTraversalMode: 'immediate' | 'nested';
}

export interface MovedDocMapping {
  originalDocId: string;
  newDocId: string;
}

export interface MoveDocResult {
  success: boolean;
  movedDocs: MovedDocMapping[];
  newWorkspaceId: string;
}

@Injectable()
export class DocMoveService {
  private readonly logger = new Logger(DocMoveService.name);

  constructor(
    private readonly ac: AccessController,
    private readonly models: Models,
    private readonly blobStorage: WorkspaceBlobStorage
  ) {}

  /**
   * Move a document (and optionally its linked documents) to a different workspace.
   * The document ID is preserved to maintain external link compatibility.
   */
  @Transactional()
  async moveToWorkspace(
    userId: string,
    input: MoveDocToWorkspaceInput
  ): Promise<MoveDocResult> {
    const {
      sourceWorkspaceId,
      docId,
      targetWorkspaceId,
      targetSpaceId,
      moveLinkedDocs,
      linkTraversalMode,
    } = input;

    // 1. Collect all docs to move
    const docsToMove = await this.collectDocsToMove(
      sourceWorkspaceId,
      docId,
      moveLinkedDocs,
      linkTraversalMode
    );

    this.logger.log(
      `Moving ${docsToMove.length} documents from workspace ${sourceWorkspaceId} to ${targetWorkspaceId}`
    );

    // 2. Check that no documents are in trash
    await this.validateNotInTrash(sourceWorkspaceId, docsToMove);

    // 3. Pre-validate all permissions (fail fast)
    await this.validatePermissions(
      userId,
      sourceWorkspaceId,
      targetWorkspaceId,
      docsToMove
    );

    // 4. Execute move for each doc (preserving doc IDs)
    const movedDocs: MovedDocMapping[] = [];

    for (const docIdToMove of docsToMove) {
      await this.moveDoc(
        sourceWorkspaceId,
        docIdToMove,
        targetWorkspaceId,
        targetSpaceId
      );
      movedDocs.push({
        originalDocId: docIdToMove,
        newDocId: docIdToMove, // ID is preserved
      });
    }

    this.logger.log(
      `Successfully moved ${movedDocs.length} documents to workspace ${targetWorkspaceId}`
    );

    return {
      success: true,
      movedDocs,
      newWorkspaceId: targetWorkspaceId,
    };
  }

  /**
   * Collect all document IDs that need to be moved based on link traversal settings.
   */
  private async collectDocsToMove(
    workspaceId: string,
    rootDocId: string,
    includeLinked: boolean,
    mode: 'immediate' | 'nested'
  ): Promise<string[]> {
    if (!includeLinked) {
      return [rootDocId];
    }

    const visited = new Set<string>();
    const queue = [rootDocId];

    while (queue.length > 0) {
      const currentDocId = queue.shift()!;
      if (visited.has(currentDocId)) continue;
      visited.add(currentDocId);

      // For immediate mode, only process the root doc's links
      if (mode === 'immediate' && currentDocId !== rootDocId) {
        continue;
      }

      // Get outgoing links from this document
      const refs = await this.getDocReferences(workspaceId, currentDocId);

      for (const refDocId of refs) {
        if (!visited.has(refDocId)) {
          queue.push(refDocId);
        }
      }
    }

    return Array.from(visited);
  }

  /**
   * Get document references (LinkedPage and embed-synced-doc) from a document's content.
   * When a user creates a nested doc (e.g., using /doc command), a LinkedPage reference
   * is inserted into the parent doc's content as a text attribute.
   *
   * This extracts those references to find documents that should be moved together
   * when "move linked docs" is enabled.
   */
  private async getDocReferences(
    workspaceId: string,
    docId: string
  ): Promise<string[]> {
    try {
      // Load the doc's Y.Doc content
      const snapshot = await this.models.doc.get(workspaceId, docId);
      if (!snapshot?.blob) {
        this.logger.debug(`No snapshot found for doc ${docId}`);
        return [];
      }

      const linkedPageIds = this.extractLinkedPageIds(snapshot.blob);
      return Array.from(linkedPageIds);
    } catch (error) {
      this.logger.warn(`Failed to get doc references for ${docId}: ${error}`);
      return [];
    }
  }

  /**
   * Extract LinkedPage reference IDs from a Y.Doc binary.
   * LinkedPage references are stored as text attributes in paragraph/list blocks:
   * { insert: ' ', attributes: { reference: { type: 'LinkedPage', pageId: '...' } } }
   *
   * Also extracts embed-synced-doc block references:
   * { sys:flavour: 'affine:embed-synced-doc', prop:pageId: '...' }
   */
  private extractLinkedPageIds(docBinary: Uint8Array): Set<string> {
    const linkedPageIds = new Set<string>();

    try {
      const doc = new YDoc();
      applyUpdate(doc, docBinary);

      // Check if this is a page doc with blocks
      if (!doc.share.has('blocks')) {
        return linkedPageIds;
      }

      const blocks = doc.getMap<YMap<unknown>>('blocks');

      for (const block of blocks.values()) {
        const flavour = block.get('sys:flavour') as string;

        // Check blocks that can have text content with LinkedPage references
        if (
          flavour === 'affine:paragraph' ||
          flavour === 'affine:list' ||
          flavour === 'affine:code'
        ) {
          const text = block.get('prop:text');
          if (text instanceof YText) {
            // Extract delta and look for LinkedPage references
            const delta = text.toDelta();
            for (const op of delta) {
              const ref = op.attributes?.reference;
              if (
                ref &&
                typeof ref === 'object' &&
                ref.type === 'LinkedPage' &&
                typeof ref.pageId === 'string'
              ) {
                linkedPageIds.add(ref.pageId);
              }
            }
          }
        }

        // Also check for embedded synced doc blocks
        if (flavour === 'affine:embed-synced-doc') {
          const pageId = block.get('prop:pageId') as string | undefined;
          if (pageId) {
            linkedPageIds.add(pageId);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to extract LinkedPage IDs: ${error}`);
    }

    return linkedPageIds;
  }

  /**
   * Validate that the user has all required permissions for the move operation.
   * Throws if any permission check fails.
   */
  private async validatePermissions(
    userId: string,
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    docIds: string[]
  ): Promise<void> {
    // Check edit permission on all source docs
    for (const docId of docIds) {
      await this.ac
        .user(userId)
        .doc(sourceWorkspaceId, docId)
        .assert('Doc.Update');
    }

    // Check create permission in target workspace
    await this.ac
      .user(userId)
      .workspace(targetWorkspaceId)
      .assert('Workspace.CreateDoc');
  }

  /**
   * Validate that none of the documents are in trash.
   * Documents must be restored from trash before they can be moved.
   */
  private async validateNotInTrash(
    workspaceId: string,
    docIds: string[]
  ): Promise<void> {
    for (const docId of docIds) {
      const isInTrash = await this.models.spaceDoc.isDocInTrash(
        workspaceId,
        docId
      );
      if (isInTrash) {
        throw new DocIsInTrash({ docId });
      }
    }
  }

  /**
   * Move a single document from source to target workspace/space.
   * Uses UPDATE instead of copy-delete for atomicity and safety.
   * Preserves the document ID for external link compatibility.
   */
  private async moveDoc(
    sourceWorkspaceId: string,
    docId: string,
    targetWorkspaceId: string,
    targetSpaceId?: string | null
  ): Promise<void> {
    const isSameWorkspace = sourceWorkspaceId === targetWorkspaceId;

    // For same-workspace moves, delegate to spaceDoc.moveDoc() which correctly
    // handles space membership and ensures doc stays in workspace meta.pages
    if (isSameWorkspace) {
      await this.models.spaceDoc.moveDoc(
        sourceWorkspaceId,
        docId,
        targetSpaceId ?? null
      );
      return;
    }

    // Cross-workspace move: handle workspace ID updates, blob copying, and metadata transfer
    // 1. Get source space and metadata BEFORE any modifications
    const sourceSpaceId = await this.models.spaceDoc.getSpaceId(docId);
    const sourceContainerId = sourceSpaceId ?? sourceWorkspaceId;

    // Get doc metadata (including icon) from source to preserve it
    const docMeta = await this.models.spaceDoc.getDocMeta(
      sourceWorkspaceId,
      docId
    );

    if (!docMeta) {
      this.logger.warn(
        `Source doc metadata not found for [${docId}], proceeding without preserved metadata`
      );
    }

    // 2. Update database references (atomic UPDATE, not copy-delete)
    // Cross-workspace: update workspace_id and space_id columns
    await this.models.doc.moveToWorkspace(
      sourceWorkspaceId,
      docId,
      targetWorkspaceId,
      targetSpaceId ?? null
    );

    // 4. Copy blobs (only needed for cross-workspace, blobs are keyed by workspace)
    await this.copyDocBlobs(sourceWorkspaceId, docId, targetWorkspaceId);

    // Move WorkspaceDoc metadata (mode, public status, etc.)
    const meta = await this.models.doc.getMeta(sourceWorkspaceId, docId);
    if (meta) {
      await this.models.doc.upsertMeta(targetWorkspaceId, docId, {
        mode: meta.mode,
        // Don't copy public status - user must re-publish if needed
      });
      await this.models.doc.deleteMeta(sourceWorkspaceId, docId);
    }

    // 5. Update SpaceDoc mappings
    await this.models.spaceDoc.removeDoc(sourceSpaceId ?? '', docId);
    if (targetSpaceId) {
      await this.models.spaceDoc.addDoc(targetSpaceId, docId);
    }

    // 6. Update meta.pages in source and target containers
    await this.models.spaceDoc.removeDocFromRootMeta(
      sourceWorkspaceId,
      sourceContainerId,
      docId
    );
    await this.models.spaceDoc.addDocToRootMeta(
      targetWorkspaceId,
      targetSpaceId ?? targetWorkspaceId,
      docId,
      docMeta ?? undefined
    );

    // 7. Ensure doc is in target workspace's meta.pages
    await this.models.spaceDoc.ensureDocInWorkspaceMeta(
      targetWorkspaceId,
      docId
    );
  }

  /**
   * Copy all blobs referenced by a document to the target workspace.
   * Extracts blob IDs from Y.Doc content and copies each blob.
   */
  private async copyDocBlobs(
    sourceWorkspaceId: string,
    docId: string,
    targetWorkspaceId: string
  ): Promise<void> {
    // Skip if moving within same workspace
    if (sourceWorkspaceId === targetWorkspaceId) {
      return;
    }

    try {
      // Get the document snapshot
      const snapshot = await this.models.doc.get(sourceWorkspaceId, docId);
      if (!snapshot?.blob) {
        return;
      }

      // Extract blob IDs from the document content
      const blobIds = this.extractBlobIds(snapshot.blob);

      if (blobIds.size === 0) {
        this.logger.debug(`No blobs found in doc ${docId}`);
        return;
      }

      this.logger.log(
        `Copying ${blobIds.size} blobs from workspace ${sourceWorkspaceId} to ${targetWorkspaceId}`
      );

      // Copy each blob to target workspace
      for (const blobId of blobIds) {
        await this.copyBlob(sourceWorkspaceId, targetWorkspaceId, blobId);
      }
    } catch (error) {
      // Log but don't fail the move if blob copying fails
      this.logger.warn(`Failed to copy blobs for doc ${docId}: ${error}`);
    }
  }

  /**
   * Extract blob IDs from a Y.Doc binary.
   * Looks for sourceId properties in affine:image and affine:attachment blocks.
   */
  private extractBlobIds(docBinary: Uint8Array): Set<string> {
    const blobIds = new Set<string>();

    try {
      const doc = new YDoc();
      applyUpdate(doc, docBinary);

      // Check if this is a page doc with blocks
      if (!doc.share.has('blocks')) {
        return blobIds;
      }

      const blocks = doc.getMap<YMap<unknown>>('blocks');

      for (const block of blocks.values()) {
        const flavour = block.get('sys:flavour') as string;

        // Check for blocks that can have blob references
        if (flavour === 'affine:image' || flavour === 'affine:attachment') {
          const sourceId = block.get('prop:sourceId') as string | undefined;
          if (sourceId && sourceId.length > 0) {
            blobIds.add(sourceId);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to extract blob IDs: ${error}`);
    }

    return blobIds;
  }

  /**
   * Copy a single blob from source to target workspace.
   */
  private async copyBlob(
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    blobId: string
  ): Promise<void> {
    try {
      const blobData = await this.blobStorage.get(sourceWorkspaceId, blobId);

      if (!blobData?.body) {
        this.logger.debug(
          `Blob ${blobId} not found in workspace ${sourceWorkspaceId}`
        );
        return;
      }

      // Read the blob data
      const chunks: Buffer[] = [];
      for await (const chunk of blobData.body) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      // Write to target workspace
      await this.blobStorage.put(targetWorkspaceId, blobId, buffer);

      this.logger.debug(
        `Copied blob ${blobId} to workspace ${targetWorkspaceId}`
      );
    } catch (error) {
      this.logger.warn(
        `Failed to copy blob ${blobId} from ${sourceWorkspaceId} to ${targetWorkspaceId}: ${error}`
      );
    }
  }

  /**
   * Find which workspace a document currently belongs to.
   * Used for 301 redirect resolution.
   */
  async findDocWorkspace(docId: string): Promise<string | null> {
    // Query snapshot table by docId to find workspaceId
    const result = await this.models.doc.findWorkspaceByDocId(docId);
    return result;
  }
}
