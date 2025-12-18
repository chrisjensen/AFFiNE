import { UserFriendlyError } from '@affine/error';
import {
  backoffRetry,
  effect,
  exhaustMapWithTrailing,
  fromPromise,
  LiveData,
  Service,
} from '@toeverything/infra';
import {
  combineLatest,
  exhaustMap,
  groupBy,
  map,
  mergeMap,
  Observable,
} from 'rxjs';

import type { WorkspaceService } from '../../workspace';
import type {
  DocPermissionActions,
  GuardStore,
  WorkspacePermissionActions,
} from '../stores/guard';
import type { WorkspacePermissionService } from './permission';

// Permission errors should not be retried - they indicate the user lacks access
const PERMISSION_ERROR_NAMES = [
  'ACCESS_DENIED',
  'DOC_ACTION_DENIED',
  'SPACE_ACCESS_DENIED',
  'DOC_NOT_FOUND',
  'WORKSPACE_ACCESS_DENIED',
] as const;

function isPermissionError(error: unknown): boolean {
  const err = UserFriendlyError.fromAny(error);
  return PERMISSION_ERROR_NAMES.some(name => err.name === name);
}

function shouldRetryError(error: unknown): boolean {
  // Don't retry permission errors - they should fail fast
  if (isPermissionError(error)) {
    return false;
  }
  // Only retry network errors
  const err = UserFriendlyError.fromAny(error);
  return err.isNetworkError();
}

export class GuardService extends Service {
  constructor(
    private readonly guardStore: GuardStore,
    private readonly workspaceService: WorkspaceService,
    private readonly workspacePermissionService: WorkspacePermissionService
  ) {
    super();
  }

  private readonly workspacePermissions$ = new LiveData<
    Partial<Record<WorkspacePermissionActions, boolean>>
  >({});

  private readonly docPermissions$ = new LiveData<
    Record<string, Partial<Record<DocPermissionActions, boolean>>>
  >({});

  private readonly isAdmin$ = LiveData.computed(get => {
    const isOwner = get(this.workspacePermissionService.permission.isOwner$);
    const isAdmin = get(this.workspacePermissionService.permission.isAdmin$);
    if (isOwner === null && isAdmin === null) {
      return null;
    }
    return isOwner || isAdmin;
  });

  /**
   * @example
   * ```ts
   * guardService.can$('Workspace_Properties_Update');
   * guardService.can$('Doc_Update', docId);
   * ```
   *
   * @returns LiveData<boolean | undefined> the value is undefined if the permission is loading
   */
  can$<T extends WorkspacePermissionActions | DocPermissionActions>(
    action: T,
    ...args: T extends DocPermissionActions ? [string] : []
  ): LiveData<boolean | undefined> {
    const docId = args[0];
    return LiveData.from(
      new Observable(subscriber => {
        let prev: boolean | undefined = undefined;

        const subscription = combineLatest([
          (docId
            ? this.docPermissions$.pipe(
                map(permissions => permissions[docId] ?? {})
              )
            : this.workspacePermissions$.asObservable()) as Observable<
            Record<string, boolean>
          >,
          this.isAdmin$,
        ]).subscribe(([permissions, isAdmin]) => {
          if (isAdmin) {
            return subscriber.next(true);
          }
          const current = permissions[action] ?? undefined;
          if (current !== prev) {
            prev = current;
            subscriber.next(current);
          }
        });

        return () => {
          subscription.unsubscribe();
        };
      }),
      undefined
    );
  }

  async can<T extends WorkspacePermissionActions | DocPermissionActions>(
    action: T,
    ...args: T extends DocPermissionActions ? [string] : []
  ): Promise<boolean> {
    const docId = args[0];

    if (this.isAdmin$.value === null) {
      await this.workspacePermissionService.permission.waitForRevalidation();
    }

    if (this.isAdmin$.value === true) {
      return true;
    }

    const permissions = await (docId
      ? this.loadDocPermission(docId)
      : this.loadWorkspacePermission());

    return permissions[action as keyof typeof permissions] ?? false;
  }

  revalidateCan<T extends WorkspacePermissionActions | DocPermissionActions>(
    _action: T,
    ...args: T extends DocPermissionActions ? [string] : []
  ) {
    // revalidate workspace permission if it's not initialized
    if (this.isAdmin$.value === null) {
      this.workspacePermissionService.permission.revalidate();
    }

    if (this.isAdmin$.value === true) {
      // if the user is admin, the permission is always true
      return;
    }

    const docId = args[0];
    // revalidate permission
    if (docId) {
      this.revalidateDocPermission(docId);
    } else {
      this.revalidateWorkspacePermission();
    }
  }

  private readonly revalidateWorkspacePermission = effect(
    exhaustMapWithTrailing(() =>
      fromPromise(() => this.guardStore.getWorkspacePermissions()).pipe(
        backoffRetry({
          when: shouldRetryError,
          count: Infinity,
        })
      )
    )
  );

  private readonly revalidateDocPermission = effect(
    groupBy((docId: string) => docId),
    mergeMap(doc$ =>
      doc$.pipe(
        exhaustMap((docId: string) =>
          fromPromise(() => this.loadDocPermission(docId)).pipe(
            backoffRetry({
              when: shouldRetryError,
              count: Infinity,
            })
          )
        )
      )
    )
  );

  private readonly loadWorkspacePermission = async () => {
    if (this.workspaceService.workspace.flavour === 'local') {
      return {} as Record<WorkspacePermissionActions, boolean>;
    }
    if (this.workspaceService.workspace.openOptions.isSharedMode) {
      return {};
    }
    const permissions = await this.guardStore.getWorkspacePermissions();
    this.workspacePermissions$.next(permissions);
    return permissions;
  };

  private readonly loadDocPermission = async (docId: string) => {
    if (this.workspaceService.workspace.flavour === 'local') {
      return {} as Record<DocPermissionActions, boolean>;
    }
    if (this.workspaceService.workspace.openOptions.isSharedMode) {
      return {};
    }
    try {
      const permissions = await this.guardStore.getDocPermissions(docId);
      this.docPermissions$.next({
        ...this.docPermissions$.value,
        [docId]: permissions,
      });
      return permissions;
    } catch (error) {
      // For permission errors, set all permissions to false
      // This allows the UI to properly show the "access denied" state
      if (isPermissionError(error)) {
        const noAccessPermissions = {
          Doc_Read: false,
          Doc_Update: false,
          Doc_Trash: false,
          Doc_Delete: false,
          Doc_Duplicate: false,
          Doc_Publish: false,
          Doc_Copy: false,
          Doc_TransferOwner: false,
          Doc_Properties_Read: false,
          Doc_Properties_Update: false,
          Doc_Users_Read: false,
          Doc_Users_Manage: false,
        } as Record<DocPermissionActions, boolean>;
        this.docPermissions$.next({
          ...this.docPermissions$.value,
          [docId]: noAccessPermissions,
        });
        return noAccessPermissions;
      }
      // Re-throw non-permission errors so they can be retried
      throw error;
    }
  };

  override dispose() {
    this.revalidateWorkspacePermission.unsubscribe();
    this.revalidateDocPermission.unsubscribe();
  }
}
