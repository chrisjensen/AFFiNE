import { Injectable, Logger } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';

import { Models } from '../../models';
import { AccessController } from '../permission';

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
    private readonly models: Models
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

    // 2. Pre-validate all permissions (fail fast)
    await this.validatePermissions(
      userId,
      sourceWorkspaceId,
      targetWorkspaceId,
      docsToMove
    );

    // 3. Execute move for each doc (preserving doc IDs)
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

    // 5. Get source space BEFORE modifying SpaceDoc mappings
    const sourceSpaceId = await this.models.spaceDoc.getSpaceId(docId);
    const sourceContainerId = sourceSpaceId ?? sourceWorkspaceId;

    // 6. Assign doc to target container (space or workspace root)
    await this.models.spaceDoc.assignDocToContainer(
      targetWorkspaceId,
      docId,
      targetSpaceId ?? null
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
   * TODO: Implement proper blob extraction from Y.Doc content.
   * For now, this is a no-op - blob copying will be added in a follow-up PR.
   */
  private async copyDocBlobs(
    _sourceWorkspaceId: string,
    _docId: string,
    _targetWorkspaceId: string
  ): Promise<void> {
    // Blob extraction requires parsing Y.Doc content to find blob references.
    // This is complex and will be implemented in a follow-up PR.
    // For MVP, documents are moved without their blobs.
    // Users will need to re-upload images/attachments if needed.
    this.logger.debug('Blob copying not yet implemented - skipping');
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
