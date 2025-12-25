import { LiveData, ObjectPool, Service } from '@toeverything/infra';

import { WorkspaceService } from '../../workspace';
import { Space } from '../entities/space';
import type {
  CreateSpaceInput,
  DocRole,
  SpaceInfo,
  SpaceStore,
} from '../stores/space';

/**
 * SpaceService manages the collection of spaces within a workspace.
 *
 * Space membership is tracked server-side in the SpaceDoc table.
 * The frontend uses server responses as the single source of truth
 * for which docs belong to which spaces.
 */
export class SpaceService extends Service {
  constructor(
    private readonly store: SpaceStore,
    private readonly workspaceService: WorkspaceService
  ) {
    super();
  }

  // Hidden doc IDs (docs in inaccessible spaces)
  readonly hiddenDocIds$ = new LiveData<string[]>([]);

  private readonly pool = new ObjectPool<string, Space>({
    onDelete(obj: Space) {
      obj.dispose();
    },
  });

  // Loading state
  readonly isLoading$ = new LiveData(false);
  readonly error$ = new LiveData<Error | null>(null);

  // Space list - stores raw SpaceInfo data
  private readonly spacesData$ = new LiveData<SpaceInfo[]>([]);

  // Track space IDs we've seen to identify stale space references
  private readonly knownSpaceIds = new Set<string>();

  // Spaces as entity objects
  readonly spaces$ = this.spacesData$.map((spaces: SpaceInfo[]) => {
    // Track space IDs we've seen (for stale reference cleanup)
    spaces.forEach(info => {
      this.knownSpaceIds.add(info.id);
    });

    return new Map<string, Space>(
      spaces.map((info: SpaceInfo) => {
        const exists = this.pool.get(info.id);
        if (exists) {
          // Update existing entity with new data
          exists.obj.updateInfo(info);
          return [info.id, exists.obj];
        }
        const space = this.framework.createEntity(Space, { spaceInfo: info });
        this.pool.put(info.id, space);
        return [info.id, space] as const;
      })
    );
  });

  // Sorted spaces list
  readonly spacesList$ = this.spaces$.map((spacesMap: Map<string, Space>) => {
    return Array.from(spacesMap.values()).sort((a: Space, b: Space) => {
      return a.name$.value.localeCompare(b.name$.value);
    });
  });

  // Get a specific space by ID
  space$(id: string) {
    return this.spaces$.selector((spaces: Map<string, Space>) =>
      spaces.get(id)
    );
  }

  // Get the space that contains a specific document
  spaceForDoc$(docId: string) {
    return this.spacesList$.map((spaces: Space[]) =>
      spaces.find((space: Space) => space.docIds$.value?.includes(docId))
    );
  }

  /**
   * Get the space ID for a document synchronously.
   * Returns null if the document is not in any space or space is not found.
   */
  getSpaceIdForDoc(docId: string): string | null {
    const spaces = this.spacesList$.value;
    const space = spaces.find((space: Space) =>
      space.docIds$.value?.includes(docId)
    );
    return space?.id ?? null;
  }

  /**
   * Load spaces from the server
   */
  async loadSpaces(signal?: AbortSignal) {
    this.isLoading$.next(true);
    this.error$.next(null);

    try {
      const [spaces, hiddenDocIds] = await Promise.all([
        this.store.listSpaces(signal),
        this.store.getHiddenDocIds(signal),
      ]);
      this.spacesData$.next(spaces);
      this.hiddenDocIds$.next(hiddenDocIds);

      // Clean up stale space references from workspace root document
      this.cleanupStaleSpaceReferences(spaces);
    } catch (err) {
      this.error$.next(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      this.isLoading$.next(false);
    }
  }

  /**
   * Clean up stale space references from the workspace root document's spaces map.
   * This removes references to spaces the user no longer has access to.
   * Only removes entries that we know are space IDs (from knownSpaceIds) to avoid
   * accidentally deleting regular document references.
   *
   * IMPORTANT: Only cleans up spaces that were previously accessible but are now not.
   * Does not delete spaces that might be syncing or newly created.
   */
  private cleanupStaleSpaceReferences(accessibleSpaces: SpaceInfo[]) {
    try {
      const workspace = this.workspaceService.workspace;
      if (!workspace) {
        return;
      }
      const rootYDoc = workspace.rootYDoc;
      const spacesMap = rootYDoc.getMap('spaces');

      // Get the set of accessible space IDs
      const accessibleSpaceIds = new Set(accessibleSpaces.map(s => s.id));

      // Find and delete stale space references
      // Only delete entries that we know are space IDs (from knownSpaceIds)
      // AND were previously accessible but are now not accessible
      const staleSpaceIds: string[] = [];
      spacesMap.forEach((_value, docId) => {
        // Only delete if:
        // 1. We know this ID is a space ID (from knownSpaceIds - meaning we've seen it before)
        // 2. It's not in the accessible spaces list (user lost access)
        // 3. It's not currently being loaded (check isLoading$)
        if (
          this.knownSpaceIds.has(docId) &&
          !accessibleSpaceIds.has(docId) &&
          !this.isLoading$.value
        ) {
          staleSpaceIds.push(docId);
        }
      });

      // Delete stale references in a transaction
      if (staleSpaceIds.length > 0) {
        rootYDoc.transact(() => {
          for (const spaceId of staleSpaceIds) {
            spacesMap.delete(spaceId);
            // Remove from known space IDs as well
            this.knownSpaceIds.delete(spaceId);
          }
        });
      }
    } catch (err) {
      // Log error but don't throw - cleanup is best effort
      console.warn('Failed to cleanup stale space references:', err);
    }
  }

  /**
   * Refresh a specific space's data
   */
  async refreshSpace(spaceId: string, signal?: AbortSignal) {
    const spaceInfo = await this.store.getSpace(spaceId, signal);
    if (spaceInfo) {
      const spaces = this.spacesData$.value;
      const index = spaces.findIndex((s: SpaceInfo) => s.id === spaceId);
      if (index >= 0) {
        spaces[index] = spaceInfo;
        this.spacesData$.next([...spaces]);
      }
    }
    return spaceInfo;
  }

  /**
   * Create a new space
   */
  async createSpace(
    input: Omit<CreateSpaceInput, 'workspaceId'>,
    signal?: AbortSignal
  ): Promise<Space> {
    const spaceInfo = await this.store.createSpace(
      input as CreateSpaceInput,
      signal
    );

    // Add to the list
    this.spacesData$.next([...this.spacesData$.value, spaceInfo]);

    // Return the space entity
    const space = this.framework.createEntity(Space, { spaceInfo });
    this.pool.put(spaceInfo.id, space);
    return space;
  }

  /**
   * Delete a space
   */
  async deleteSpace(spaceId: string, signal?: AbortSignal): Promise<boolean> {
    const result = await this.store.deleteSpace(spaceId, signal);
    if (result) {
      // Remove from the list
      this.spacesData$.next(
        this.spacesData$.value.filter((s: SpaceInfo) => s.id !== spaceId)
      );
      // Remove from pool
      this.pool.objects.delete(spaceId);
    }
    return result;
  }

  /**
   * Move a doc to a space (or to workspace root if spaceId is null)
   */
  async moveDocToSpace(
    docId: string,
    spaceId: string | null,
    signal?: AbortSignal
  ): Promise<boolean> {
    const result = await this.store.moveDocToSpace(docId, spaceId, signal);
    if (result) {
      // Refresh the target space's doc list to show the new doc
      if (spaceId) {
        await this.refreshSpace(spaceId, signal);
      }
      // Also refresh all spaces to update doc counts
      await this.loadSpaces(signal);
    }
    return result;
  }

  /**
   * Grant a user role in a space
   */
  async grantUserRole(
    spaceId: string,
    userId: string,
    role: DocRole,
    signal?: AbortSignal
  ): Promise<boolean> {
    return this.store.grantUserRole(spaceId, userId, role, signal);
  }

  /**
   * Revoke a user's role from a space
   */
  async revokeUserRole(
    spaceId: string,
    userId: string,
    signal?: AbortSignal
  ): Promise<boolean> {
    return this.store.revokeUserRole(spaceId, userId, signal);
  }
}
