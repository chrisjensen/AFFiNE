import { Injectable, Logger } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { applyUpdate, Doc as YDoc, Map as YMap } from 'yjs';

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
   * Get document references (outgoing links) from a document.
   * TODO: Implement proper link extraction from Y.Doc content or indexer.
   * For now, returns empty array - linked doc moving will be a follow-up.
   */
  private async getDocReferences(
    _workspaceId: string,
    _docId: string
  ): Promise<string[]> {
    // Link extraction requires parsing Y.Doc content which is complex.
    // For MVP, we only move the single document.
    // Linked doc support will be added in a follow-up PR.
    return [];
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
   * Move a single document from source to target workspace.
   * Preserves the document ID for external link compatibility.
   * Optionally assigns the doc to a space in the target workspace.
   */
  private async moveDoc(
    sourceWorkspaceId: string,
    docId: string,
    targetWorkspaceId: string,
    targetSpaceId?: string | null
  ): Promise<void> {
    // 1. Copy snapshot to target workspace
    const snapshot = await this.models.doc.get(sourceWorkspaceId, docId);
    if (snapshot) {
      await this.models.doc.upsert({
        spaceId: targetWorkspaceId,
        containerSpaceId: targetSpaceId ?? undefined,
        docId: docId, // Preserve the original doc ID
        blob: snapshot.blob,
        timestamp: Date.now(),
        editorId: snapshot.editorId,
      });
    }

    // 2. Copy pending updates
    const updates = await this.models.doc.findUpdates(sourceWorkspaceId, docId);
    if (updates.length > 0) {
      await this.models.doc.createUpdates(
        updates.map(u => ({
          spaceId: targetWorkspaceId,
          containerSpaceId: targetSpaceId ?? undefined,
          docId: docId,
          blob: u.blob,
          timestamp: u.timestamp,
          editorId: u.editorId,
        }))
      );
    }

    // 3. Copy doc metadata
    const meta = await this.models.doc.getMeta(sourceWorkspaceId, docId);
    if (meta) {
      await this.models.doc.upsertMeta(targetWorkspaceId, docId, {
        mode: meta.mode,
        // Don't copy public status - user must re-publish if needed
      });
    }

    // 4. Copy blobs referenced by this document
    await this.copyDocBlobs(sourceWorkspaceId, docId, targetWorkspaceId);

    // 5. Get source space and doc metadata BEFORE modifying SpaceDoc mappings
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

    // 6. Assign doc to target container (space or workspace root)
    // Pass metadata to preserve icon and other properties
    await this.models.spaceDoc.assignDocToContainer(
      targetWorkspaceId,
      docId,
      targetSpaceId ?? null,
      docMeta ?? undefined
    );

    // 7. Remove from source and delete
    await this.models.spaceDoc.removeDocFromRootMeta(
      sourceWorkspaceId,
      sourceContainerId,
      docId
    );
    await this.models.doc.delete(sourceWorkspaceId, docId);
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
