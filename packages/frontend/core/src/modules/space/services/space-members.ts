import {
  catchErrorInto,
  effect,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
  Service,
  smartRetry,
} from '@toeverything/infra';
import { EMPTY, exhaustMap, tap } from 'rxjs';

import type { SpaceMember, SpaceStore } from '../stores/space';
import { DocRole } from '../stores/space';

export class SpaceMembersService extends Service {
  constructor(private readonly store: SpaceStore) {
    super();
  }

  readonly PAGE_SIZE = 8;

  private readonly spaceId$ = new LiveData<string | null>(null);
  nextCursor$ = new LiveData<string | undefined>(undefined);
  hasMore$ = new LiveData(true);
  memberCount$ = new LiveData(0);
  members$ = new LiveData<SpaceMember[]>([]);
  isLoading$ = new LiveData(false);
  error$ = new LiveData<Error | null>(null);

  setSpace(spaceId: string) {
    if (this.spaceId$.value !== spaceId) {
      this.spaceId$.setValue(spaceId);
      this.reset();
    }
  }

  readonly loadMore = effect(
    exhaustMap(() => {
      const spaceId = this.spaceId$.value;
      if (!spaceId || !this.hasMore$.value) {
        return EMPTY;
      }
      return fromPromise(async signal => {
        return await this.store.getSpaceMembers(
          spaceId,
          {
            first: this.PAGE_SIZE,
            after: this.nextCursor$.value,
          },
          signal
        );
      }).pipe(
        tap(({ edges, pageInfo, totalCount }) => {
          this.members$.next([
            ...this.members$.value,
            ...edges.map(edge => edge.node),
          ]);

          this.memberCount$.next(totalCount);
          this.hasMore$.next(pageInfo.hasNextPage);
          this.nextCursor$.next(pageInfo.endCursor ?? undefined);
        }),
        smartRetry(),
        catchErrorInto(this.error$),
        onStart(() => {
          this.isLoading$.setValue(true);
        }),
        onComplete(() => this.isLoading$.setValue(false))
      );
    })
  );

  reset() {
    this.members$.setValue([]);
    this.memberCount$.setValue(0);
    this.hasMore$.setValue(true);
    this.nextCursor$.setValue(undefined);
    this.isLoading$.setValue(false);
    this.error$.setValue(null);
    this.loadMore.reset();
  }

  async grantUserRole(userId: string, role: DocRole): Promise<boolean> {
    const spaceId = this.spaceId$.value;
    if (!spaceId) return false;

    const result = await this.store.grantUserRole(spaceId, userId, role);
    if (result) {
      // Refresh the list to show the new member
      this.reset();
      this.loadMore();
    }
    return result;
  }

  async updateMemberRole(userId: string, role: DocRole): Promise<boolean> {
    const spaceId = this.spaceId$.value;
    if (!spaceId) return false;

    const result = await this.store.grantUserRole(spaceId, userId, role);
    if (result) {
      if (role === DocRole.Owner) {
        // Owner transfer changes multiple roles, refresh the list
        this.reset();
        this.loadMore();
        return result;
      }
      // Update local state for non-owner role changes
      this.members$.next(
        this.members$.value.map(member => {
          if (member.user.id === userId) {
            return { ...member, role };
          }
          return member;
        })
      );
    }
    return result;
  }

  async removeMember(userId: string): Promise<boolean> {
    const spaceId = this.spaceId$.value;
    if (!spaceId) return false;

    const result = await this.store.revokeUserRole(spaceId, userId);
    if (result) {
      this.members$.next(
        this.members$.value.filter(member => member.user.id !== userId)
      );
      if (this.memberCount$.value > 0) {
        this.memberCount$.next(this.memberCount$.value - 1);
      }
    }
    return result;
  }

  override dispose(): void {
    this.loadMore.unsubscribe();
  }
}
