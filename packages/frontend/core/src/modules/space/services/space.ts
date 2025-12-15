import { LiveData, ObjectPool, Service } from '@toeverything/infra';

import { Space } from '../entities/space';
import type {
  CreateSpaceInput,
  DocRole,
  SpaceInfo,
  SpaceStore,
} from '../stores/space';

export class SpaceService extends Service {
  constructor(private readonly store: SpaceStore) {
    super();
  }

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

  // Spaces as entity objects
  readonly spaces$ = this.spacesData$.map((spaces: SpaceInfo[]) => {
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

  /**
   * Load spaces from the server
   */
  async loadSpaces(signal?: AbortSignal) {
    this.isLoading$.next(true);
    this.error$.next(null);

    try {
      const spaces = await this.store.listSpaces(signal);
      this.spacesData$.next(spaces);
    } catch (err) {
      this.error$.next(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      this.isLoading$.next(false);
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
