import { Injectable } from '@nestjs/common';
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

interface DocMeta {
  id: string;
  title?: string;
  createDate?: number;
  tags?: string[];
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
   * 1. The containerSpaceId in the doc storage (Snapshot/Update/History tables)
   * 2. The SpaceDoc mapping table (for backward compatibility)
   * 3. The source container's root doc meta.pages (remove doc)
   * 4. The target container's root doc meta.pages (add doc)
   */
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

    // Remove from source container
    const sourceContainerId = currentSpaceId ?? workspaceId;
    await this.removeDocFromRootMeta(workspaceId, sourceContainerId, docId);

    // Assign to target container (space or workspace root)
    await this.assignDocToContainer(workspaceId, docId, targetSpaceId);

    this.logger.log(
      `Doc [${docId}] moved to ${targetSpaceId ? `space [${targetSpaceId}]` : 'workspace root'}`
    );
  }

  /**
   * Assign a doc to a container (space or workspace root) and update the root meta.
   * This is a higher-level method that combines addDoc + addDocToRootMeta.
   * Used for cross-workspace moves where we just need to set up the target location.
   */
  async assignDocToContainer(
    workspaceId: string,
    docId: string,
    targetSpaceId: string | null
  ): Promise<void> {
    if (targetSpaceId) {
      await this.addDoc(targetSpaceId, docId);
    }
    const targetContainerId = targetSpaceId ?? workspaceId;
    await this.addDocToRootMeta(workspaceId, targetContainerId, docId);
  }

  /**
   * Add a doc to a container's (space or workspace) root document meta.pages.
   * @param workspaceId The workspace ID
   * @param containerId The container ID (space ID or workspace ID for root)
   * @param docId The doc ID to add
   */
  async addDocToRootMeta(
    workspaceId: string,
    containerId: string,
    docId: string
  ): Promise<void> {
    this.logger.log(
      `[addDocToRootMeta] Starting: workspaceId=${workspaceId}, containerId=${containerId}, docId=${docId}`
    );
    try {
      let snapshot = await this.models.doc.get(workspaceId, containerId);
      if (!snapshot) {
        // If this is a space (not workspace root), create the missing root doc
        if (containerId !== workspaceId) {
          this.logger.log(
            `[addDocToRootMeta] Space root doc [${containerId}] not found, creating it`
          );
          await this.createMissingSpaceRootDoc(workspaceId, containerId);
          snapshot = await this.models.doc.get(workspaceId, containerId);
        }

        if (!snapshot) {
          this.logger.warn(
            `[addDocToRootMeta] Container root doc [${containerId}] still not found, skipping meta.pages update`
          );
          return;
        }
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
        meta.set('pages', new YArray<DocMeta>());
      }

      const pages = meta.get('pages') as YArray<DocMeta>;

      // Check if doc already exists in meta.pages
      let exists = false;
      for (let i = 0; i < pages.length; i++) {
        const page = pages.get(i);
        // Items must be YMap instances for proper CRDT sync
        if (page instanceof YMap && page.get('id') === docId) {
          exists = true;
          break;
        }
      }

      if (!exists) {
        this.logger.log(
          `[addDocToRootMeta] Doc not in pages, adding. Current pages length: ${pages.length}`
        );
        // Add the doc to meta.pages as a YMap (required for proper CRDT sync)
        pages.push([
          new YMap<unknown>([
            ['id', docId],
            ['title', ''],
            ['createDate', Date.now()],
            ['tags', new YArray()],
          ]),
        ]);
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
   */
  async removeDocFromRootMeta(
    workspaceId: string,
    containerId: string,
    docId: string
  ): Promise<void> {
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
      const pages = meta.get('pages') as YArray<DocMeta> | undefined;

      if (!pages || pages.length === 0) {
        return;
      }

      // Find the doc in meta.pages and remove it
      let indexToRemove = -1;
      for (let i = 0; i < pages.length; i++) {
        const page = pages.get(i);
        // Items must be YMap instances for proper CRDT sync
        if (page instanceof YMap && page.get('id') === docId) {
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

  /**
   * Create a missing space root document.
   * This is a recovery mechanism for spaces that were created before root docs were implemented.
   */
  private async createMissingSpaceRootDoc(
    workspaceId: string,
    spaceId: string
  ): Promise<void> {
    // Get the space to check if it exists and get its name
    const space = await this.db.workspaceSpace.findUnique({
      where: { id: spaceId },
    });

    if (!space) {
      this.logger.warn(
        `[createMissingSpaceRootDoc] Space [${spaceId}] not found, cannot create root doc`
      );
      return;
    }

    // Create Yjs document with spaceId as guid
    const rootDoc = new YDoc({ guid: spaceId });
    const meta = rootDoc.getMap('meta') as YMap<unknown>;

    // Initialize meta structure (similar to workspace root doc)
    meta.set('pages', new YArray<DocMeta>());
    meta.set('name', space.name);

    // Encode the document as update
    const update = encodeStateAsUpdate(rootDoc);

    // Store the root doc snapshot
    await this.models.doc.upsert({
      spaceId: workspaceId,
      containerSpaceId: undefined, // Root doc is at workspace level
      docId: spaceId,
      blob: update,
      timestamp: Date.now(),
    });

    this.logger.log(
      `[createMissingSpaceRootDoc] Created missing space root doc [${spaceId}] for space "${space.name}"`
    );
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
}
