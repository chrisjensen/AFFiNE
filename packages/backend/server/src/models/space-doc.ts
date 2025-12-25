import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { SpaceDoc } from '@prisma/client';
import {
  applyUpdate,
  Array as YArray,
  Doc as YDoc,
  encodeStateAsUpdate,
  Map as YMap,
} from 'yjs';

import { PaginationInput } from '../base';
import { BaseModel } from './base';

// Icon format matches frontend SpaceIconData type
type DocIcon =
  | { type: 'emoji'; unicode: string }
  | { type: 'affine-icon'; name: string; color: string };

interface DocMeta {
  id: string;
  title?: string;
  createDate?: number;
  tags?: string[];
  trash?: boolean;
  icon?: DocIcon;
}

@Injectable()
export class SpaceDocModel extends BaseModel {
  /**
   * Add a doc to a space.
   */
  async addDoc(spaceId: string, docId: string) {
    const existing = await this.get(spaceId, docId);
    if (existing) {
      return existing;
    }

    const spaceDoc = await this.db.spaceDoc.create({
      data: {
        spaceId,
        docId,
      },
    });

    this.logger.log(`Doc [${docId}] added to space [${spaceId}]`);
    return spaceDoc;
  }

  /**
   * Remove a doc from a space.
   */
  async removeDoc(spaceId: string, docId: string) {
    await this.db.spaceDoc.deleteMany({
      where: {
        spaceId,
        docId,
      },
    });

    this.logger.log(`Doc [${docId}] removed from space [${spaceId}]`);
  }

  /**
   * Move a doc to a different space (or to workspace root if targetSpaceId is null).
   * This updates:
   * 1. The SpaceDoc mapping table (source of truth for space membership)
   * 2. Ensures the doc is in workspace's meta.pages (for blockCollections)
   *
   * NOTE: Space.meta.pages updates are no longer needed - space membership
   * is tracked only in SpaceDoc table. The workspace.meta.pages is the
   * registry of all docs in the workspace, used by the frontend's blockCollections.
   *
   * This operation is transactional - all database operations happen atomically.
   * If any step fails, all changes are rolled back.
   */
  @Transactional()
  async moveDoc(
    workspaceId: string,
    docId: string,
    targetSpaceId: string | null
  ) {
    // Get the current space (source) for this doc
    const currentSpaceId = await this.getSpaceId(docId);

    // Update containerSpaceId in the storage layer (enforces sync boundaries)
    await this.models.doc.moveToSpace(workspaceId, docId, targetSpaceId);

    // Update the SpaceDoc mapping table (for backward compatibility)
    await this.db.spaceDoc.deleteMany({
      where: { docId },
    });

    // If moving FROM a space, remove from that space's meta.pages
    // Note: NEVER remove from workspace's meta.pages - it's the registry for all docs
    if (currentSpaceId) {
      await this.removeDocFromRootMeta(workspaceId, currentSpaceId, docId);
    }

    // If moving TO a space, add to that space's meta.pages and SpaceDoc table
    // Note: Doc remains in workspace's meta.pages (ensured by ensureDocInWorkspaceMeta)
    if (targetSpaceId) {
      await this.addDoc(targetSpaceId, docId);
      await this.addDocToRootMeta(workspaceId, targetSpaceId, docId);
    }

    // Ensure the doc is in workspace's meta.pages (it should already be there,
    // but this handles edge cases like newly created docs or data inconsistencies)
    await this.ensureDocInWorkspaceMeta(workspaceId, docId);

    this.logger.log(
      `Doc [${docId}] moved to ${targetSpaceId ? `space [${targetSpaceId}]` : 'workspace root'}`
    );
  }

  /**
   * Ensure a doc is in the workspace's meta.pages.
   * This is a safety check - docs should always be in workspace.meta.pages
   * as it's the registry used by the frontend's blockCollections.
   */
  async ensureDocInWorkspaceMeta(
    workspaceId: string,
    docId: string
  ): Promise<void> {
    try {
      const snapshot = await this.models.doc.get(workspaceId, workspaceId);
      if (!snapshot) {
        this.logger.warn(
          `[ensureDocInWorkspaceMeta] Workspace root doc not found, cannot ensure doc in meta.pages`
        );
        return;
      }

      const yDoc = new YDoc({ guid: workspaceId });
      applyUpdate(yDoc, snapshot.blob);

      const meta = yDoc.getMap('meta') as YMap<unknown>;
      if (!meta.has('pages')) {
        meta.set('pages', new YArray<YMap<unknown>>());
      }

      const pages = meta.get('pages') as YArray<YMap<unknown>>;

      // Check if doc already exists
      for (let i = 0; i < pages.length; i++) {
        const page = pages.get(i);
        if (page.get('id') === docId) {
          return; // Already exists, nothing to do
        }
      }

      // Doc not found in workspace meta.pages - add it
      this.logger.log(
        `[ensureDocInWorkspaceMeta] Doc [${docId}] not in workspace meta.pages, adding it`
      );

      // Try to get metadata from the doc itself
      const docMeta = await this.getDocMeta(workspaceId, docId);

      const docMap = new YMap<unknown>([
        ['id', docId],
        ['title', docMeta?.title ?? ''],
        ['createDate', docMeta?.createDate ?? Date.now()],
        ['tags', new YArray()],
      ]);

      pages.push([docMap]);

      const update = encodeStateAsUpdate(yDoc);
      await this.models.doc.upsert({
        spaceId: workspaceId,
        docId: workspaceId,
        blob: update,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error(
        `[ensureDocInWorkspaceMeta] Failed to ensure doc [${docId}] in workspace meta.pages`,
        error
      );
    }
  }

  /**
   * Assign a doc to a container (space or workspace root) and update the root meta.
   * This is a higher-level method that combines addDoc + addDocToRootMeta.
   * Used for cross-workspace moves where we just need to set up the target location.
   * @param metadata Optional metadata to preserve (title, icon, etc.)
   */
  async assignDocToContainer(
    workspaceId: string,
    docId: string,
    targetSpaceId: string | null,
    metadata?: Partial<DocMeta>
  ): Promise<void> {
    if (targetSpaceId) {
      await this.addDoc(targetSpaceId, docId);
    }
    const targetContainerId = targetSpaceId ?? workspaceId;
    await this.addDocToRootMeta(
      workspaceId,
      targetContainerId,
      docId,
      metadata
    );
  }

  /**
   * Add a doc to a container's (space or workspace) root document meta.pages.
   * @param workspaceId The workspace ID
   * @param containerId The container ID (space ID or workspace ID for root)
   * @param docId The doc ID to add
   * @param metadata Optional metadata to preserve (title, icon, etc.)
   *
   * NOTE: Space.meta.pages updates are no longer needed - space membership
   * is tracked in SpaceDoc table. Only workspace.meta.pages is updated
   * (needed for frontend blockCollections).
   */
  async addDocToRootMeta(
    workspaceId: string,
    containerId: string,
    docId: string,
    metadata?: Partial<DocMeta>
  ): Promise<void> {
    // Skip space.meta.pages updates - no longer needed.
    // Space membership is now tracked only in SpaceDoc table.
    // Only update workspace.meta.pages (for blockCollections).
    if (containerId !== workspaceId) {
      this.logger.log(
        `[addDocToRootMeta] Skipping space.meta.pages update for space [${containerId}] - use SpaceDoc table`
      );
      return;
    }

    this.logger.log(
      `[addDocToRootMeta] Starting: workspaceId=${workspaceId}, containerId=${containerId}, docId=${docId}`
    );
    try {
      const snapshot = await this.models.doc.get(workspaceId, containerId);
      if (!snapshot) {
        this.logger.warn(
          `[addDocToRootMeta] Container root doc [${containerId}] not found, skipping meta.pages update`
        );
        return;
      }
      this.logger.log(
        `[addDocToRootMeta] Found snapshot, blob size: ${snapshot.blob.length}`
      );

      // Load the Yjs document
      const yDoc = new YDoc({ guid: containerId });
      applyUpdate(yDoc, snapshot.blob);

      const meta = yDoc.getMap('meta') as YMap<unknown>;

      // Initialize pages array if needed
      if (!meta.has('pages')) {
        meta.set('pages', new YArray<YMap<unknown>>());
      }

      // Pages array contains YMap items (required for CRDT sync)
      const pages = meta.get('pages') as YArray<YMap<unknown>>;

      // Check if doc already exists in meta.pages
      let exists = false;
      for (let i = 0; i < pages.length; i++) {
        const page = pages.get(i);
        if (page.get('id') === docId) {
          exists = true;
          break;
        }
      }

      if (!exists) {
        this.logger.log(
          `[addDocToRootMeta] Doc not in pages, adding. Current pages length: ${pages.length}`
        );
        // Add the doc to meta.pages as a YMap (required for proper CRDT sync)
        // Preserve metadata if provided (e.g., when moving documents)
        const docMap = new YMap<unknown>([
          ['id', docId],
          ['title', metadata?.title ?? ''],
          ['createDate', metadata?.createDate ?? Date.now()],
          ['tags', new YArray()],
        ]);

        // Preserve icon if provided
        if (metadata?.icon) {
          docMap.set('icon', metadata.icon);
        }

        pages.push([docMap]);
        this.logger.log(
          `[addDocToRootMeta] After push, pages length: ${pages.length}`
        );

        // Save the updated doc
        const update = encodeStateAsUpdate(yDoc);
        this.logger.log(
          `[addDocToRootMeta] Encoded update, size: ${update.length} bytes`
        );
        const result = await this.models.doc.upsert({
          spaceId: workspaceId,
          docId: containerId,
          blob: update,
          timestamp: Date.now(),
        });

        this.logger.log(
          `[addDocToRootMeta] Upsert result: ${result ? 'success' : 'no update (stale timestamp?)'}`
        );
        this.logger.log(
          `Added doc [${docId}] to container [${containerId}] meta.pages`
        );
      } else {
        this.logger.log(
          `[addDocToRootMeta] Doc already exists in pages, skipping`
        );
      }
    } catch (error) {
      this.logger.error(
        `[addDocToRootMeta] Failed to add doc [${docId}] to container [${containerId}] meta.pages`,
        error
      );
    }
  }

  /**
   * Remove a doc from a container's (space or workspace) root document meta.pages.
   * @param workspaceId The workspace ID
   * @param containerId The container ID (space ID or workspace ID for root)
   * @param docId The doc ID to remove
   *
   * NOTE: Space.meta.pages updates are no longer needed - space membership
   * is tracked in SpaceDoc table. Only workspace.meta.pages is updated
   * (needed for frontend blockCollections).
   */
  async removeDocFromRootMeta(
    workspaceId: string,
    containerId: string,
    docId: string
  ): Promise<void> {
    // Skip space.meta.pages updates - no longer needed.
    // Space membership is now tracked only in SpaceDoc table.
    // Only update workspace.meta.pages (for blockCollections).
    if (containerId !== workspaceId) {
      this.logger.log(
        `[removeDocFromRootMeta] Skipping space.meta.pages update for space [${containerId}] - use SpaceDoc table`
      );
      return;
    }

    try {
      const snapshot = await this.models.doc.get(workspaceId, containerId);
      if (!snapshot) {
        this.logger.warn(
          `Container root doc [${containerId}] not found, skipping meta.pages update`
        );
        return;
      }

      // Load the Yjs document
      const yDoc = new YDoc({ guid: containerId });
      applyUpdate(yDoc, snapshot.blob);

      const meta = yDoc.getMap('meta') as YMap<unknown>;
      const pages = meta.get('pages') as YArray<YMap<unknown>> | undefined;

      if (!pages || pages.length === 0) {
        return;
      }

      // Find the doc in meta.pages and remove it
      let indexToRemove = -1;
      for (let i = 0; i < pages.length; i++) {
        const page = pages.get(i);
        if (page.get('id') === docId) {
          indexToRemove = i;
          break;
        }
      }

      if (indexToRemove !== -1) {
        pages.delete(indexToRemove, 1);

        // Save the updated doc
        const update = encodeStateAsUpdate(yDoc);
        await this.models.doc.upsert({
          spaceId: workspaceId,
          docId: containerId,
          blob: update,
          timestamp: Date.now(),
        });

        this.logger.log(
          `Removed doc [${docId}] from container [${containerId}] meta.pages`
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to remove doc [${docId}] from container [${containerId}] meta.pages`,
        error
      );
    }
  }

  async get(spaceId: string, docId: string) {
    return await this.db.spaceDoc.findUnique({
      where: {
        spaceId_docId: {
          spaceId,
          docId,
        },
      },
    });
  }

  /**
   * Get the space that a doc belongs to.
   * Returns null if the doc is in the workspace root.
   */
  async getSpaceForDoc(docId: string) {
    return await this.db.spaceDoc.findFirst({
      where: { docId },
    });
  }

  /**
   * Get the space ID that a doc belongs to.
   * Returns null if the doc is in the workspace root.
   */
  async getSpaceId(docId: string): Promise<string | null> {
    const spaceDoc = await this.getSpaceForDoc(docId);
    return spaceDoc?.spaceId ?? null;
  }

  /**
   * Get the space IDs for multiple docs.
   * Returns a Map of docId -> spaceId (null if doc is in workspace root).
   */
  async getSpaceIdsForDocs(
    docIds: string[]
  ): Promise<Map<string, string | null>> {
    if (docIds.length === 0) {
      return new Map();
    }

    const spaceDocs = await this.db.spaceDoc.findMany({
      where: { docId: { in: docIds } },
      select: { docId: true, spaceId: true },
    });

    const result = new Map<string, string | null>();
    for (const docId of docIds) {
      result.set(docId, null);
    }
    for (const spaceDoc of spaceDocs) {
      result.set(spaceDoc.docId, spaceDoc.spaceId);
    }

    return result;
  }

  /**
   * Alias for addDoc - used by tests
   */
  async add(spaceId: string, docId: string) {
    return this.addDoc(spaceId, docId);
  }

  /**
   * Alias for getDocIds - used by tests
   */
  async list(spaceId: string) {
    return this.getDocIds(spaceId);
  }

  /**
   * Get all doc IDs in a space.
   */
  async getDocIds(spaceId: string) {
    const spaceDocs = await this.db.spaceDoc.findMany({
      where: { spaceId },
      select: { docId: true },
    });
    return spaceDocs.map(sd => sd.docId);
  }

  /**
   * Get all docs in a space with full SpaceDoc records.
   */
  async listDocs(spaceId: string) {
    return await this.db.spaceDoc.findMany({
      where: { spaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Check if a doc belongs to a space.
   */
  async isDocInSpace(spaceId: string, docId: string) {
    const spaceDoc = await this.get(spaceId, docId);
    return spaceDoc !== null;
  }

  count(spaceId: string) {
    return this.db.spaceDoc.count({
      where: { spaceId },
    });
  }

  async paginate(
    spaceId: string,
    pagination: PaginationInput
  ): Promise<[SpaceDoc[], number]> {
    return await Promise.all([
      this.db.spaceDoc.findMany({
        where: {
          spaceId,
          createdAt: pagination.after ? { gte: pagination.after } : undefined,
        },
        orderBy: { createdAt: 'asc' },
        take: pagination.first,
        skip: pagination.offset + (pagination.after ? 1 : 0),
      }),
      this.count(spaceId),
    ]);
  }

  /**
   * Check if a doc is in trash by looking at its meta in the workspace root doc.
   * @param workspaceId The workspace ID
   * @param docId The doc ID to check
   * @returns true if the doc is in trash, false otherwise
   */
  async isDocInTrash(workspaceId: string, docId: string): Promise<boolean> {
    try {
      // Get the workspace root doc
      const snapshot = await this.models.doc.get(workspaceId, workspaceId);
      if (!snapshot) {
        return false;
      }

      // Load the Yjs document
      const yDoc = new YDoc({ guid: workspaceId });
      applyUpdate(yDoc, snapshot.blob);

      const meta = yDoc.getMap('meta') as YMap<unknown>;
      const pages = meta.get('pages') as YArray<YMap<unknown>> | undefined;

      if (!pages || pages.length === 0) {
        return false;
      }

      // Find the doc in meta.pages and check its trash status
      for (let i = 0; i < pages.length; i++) {
        const page = pages.get(i);
        if (page.get('id') === docId) {
          const trash = page.get('trash');
          return trash === true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error(
        `Failed to check trash status for doc [${docId}] in workspace [${workspaceId}]`,
        error
      );
      return false;
    }
  }

  /**
   * Get the metadata for a doc from the workspace root doc.
   * @param workspaceId The workspace ID
   * @param docId The doc ID to get metadata for
   * @returns The doc metadata including title, icon, etc., or null if not found
   */
  async getDocMeta(
    workspaceId: string,
    docId: string
  ): Promise<Partial<DocMeta> | null> {
    try {
      // Get the workspace root doc
      const snapshot = await this.models.doc.get(workspaceId, workspaceId);
      if (!snapshot) {
        return null;
      }

      // Load the Yjs document
      const yDoc = new YDoc({ guid: workspaceId });
      applyUpdate(yDoc, snapshot.blob);

      const meta = yDoc.getMap('meta') as YMap<unknown>;
      const pages = meta.get('pages') as YArray<YMap<unknown>> | undefined;

      if (!pages || pages.length === 0) {
        return null;
      }

      // Find the doc in meta.pages and return its metadata
      for (let i = 0; i < pages.length; i++) {
        const page = pages.get(i);
        if (page.get('id') === docId) {
          const docMeta: Partial<DocMeta> = {
            id: docId,
            title: page.get('title') as string | undefined,
            createDate: page.get('createDate') as number | undefined,
            icon: page.get('icon') as DocIcon | undefined,
          };
          return docMeta;
        }
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Failed to get doc meta for doc [${docId}] in workspace [${workspaceId}]`,
        error
      );
      return null;
    }
  }
}
