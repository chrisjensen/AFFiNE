import { Entity, LiveData } from '@toeverything/infra';
import { combineLatest, map, startWith } from 'rxjs';
import { Doc as YDoc } from 'yjs';

import { WorkspaceEngineService } from '../../workspace';
import { SpaceMetaImpl } from '../impls/meta';
import {
  type DocRole,
  numericToDocRole,
  type SpaceInfo,
  type SpaceStore,
} from '../stores/space';

export class Space extends Entity<{ spaceInfo: SpaceInfo }> {
  constructor(private readonly store: SpaceStore) {
    super();
  }

  readonly id = this.props.spaceInfo.id;
  readonly workspaceId = this.props.spaceInfo.workspaceId;

  // Root Yjs document for this space (docId = spaceId, following workspace pattern)
  readonly rootYDoc = new YDoc({ guid: this.id });

  // Space metadata manager (manages meta.pages array)
  readonly meta = new SpaceMetaImpl(this.rootYDoc);

  // Track if root doc is connected to sync engine
  private _isConnected = false;

  // LiveData for reactive updates
  readonly info$ = new LiveData<SpaceInfo>(this.props.spaceInfo);
  readonly name$ = this.info$.map((info: SpaceInfo) => info.name);
  readonly description$ = this.info$.map((info: SpaceInfo) => info.description);
  readonly icon$ = this.info$.map((info: SpaceInfo) => info.icon);
  readonly role$ = this.info$.map((info: SpaceInfo) => info.role);
  // Convert numeric defaultRole from GraphQL to DocRole enum string
  readonly defaultRole$ = this.info$.map((info: SpaceInfo) =>
    numericToDocRole(info.defaultRole)
  );
  readonly docCount$ = this.info$.map((info: SpaceInfo) => info.docCount);

  // Derive docIds from server response (authoritative) with Yjs as reactive trigger
  // Server response is the source of truth for which docs belong to this space
  // Yjs doc may eventually provide real-time sync, but for now server is authoritative
  readonly docIds$ = LiveData.from<string[]>(
    combineLatest([
      // Server-provided docIds from GraphQL response (authoritative)
      this.info$.pipe(map((info: SpaceInfo) => info.docIds ?? [])),
      // Yjs-synced docIds - used as a reactive trigger but server takes precedence
      this.meta.docMetaUpdated.pipe(
        startWith(undefined),
        map(() => this.meta.docIds)
      ),
    ]).pipe(
      map(([serverDocIds, _yjsDocIds]) => {
        // Server response is authoritative - use it directly
        // Yjs data is included in combineLatest to trigger re-evaluation
        // when real-time sync eventually updates the Yjs doc
        return serverDocIds;
      })
    ),
    this.props.spaceInfo.docIds ?? []
  );

  updateInfo(info: SpaceInfo) {
    this.info$.next(info);
  }

  async rename(name: string) {
    const updated = await this.store.updateSpace(this.id, { name });
    this.updateInfo({ ...this.info$.value, ...updated });
    return updated;
  }

  async updateDescription(description: string) {
    const updated = await this.store.updateSpace(this.id, { description });
    this.updateInfo({ ...this.info$.value, ...updated });
    return updated;
  }

  async updateIcon(icon: string | null) {
    const updated = await this.store.updateSpace(this.id, {
      icon: icon ?? undefined,
    });
    this.updateInfo({ ...this.info$.value, ...updated });
    return updated;
  }

  async updateDefaultRole(defaultRole: DocRole) {
    const updated = await this.store.updateSpace(this.id, { defaultRole });
    this.updateInfo({ ...this.info$.value, ...updated });
    return updated;
  }

  async delete() {
    return this.store.deleteSpace(this.id);
  }

  async grantUserRole(userId: string, role: DocRole) {
    return this.store.grantUserRole(this.id, userId, role);
  }

  async revokeUserRole(userId: string) {
    return this.store.revokeUserRole(this.id, userId);
  }

  async moveDocToSpace(docId: string) {
    return this.store.moveDocToSpace(docId, this.id);
  }

  /**
   * Connect the space's root document to the sync engine.
   * This enables syncing the space's doc metadata (meta.pages).
   * Should be called after the workspace engine is started.
   */
  connectRootDoc() {
    if (this._isConnected) {
      return;
    }

    try {
      const engineService = this.framework.get(WorkspaceEngineService);
      const engine = engineService.engine;

      // Check if engine is started (has client initialized)
      if (!engine.started) {
        // Engine not started yet - will be connected via WorkspaceEngineBeforeStart event
        return;
      }

      // Connect the space root doc to the sync engine
      engine.doc.connectDoc(this.rootYDoc);

      // NOTE: Do NOT call this.meta.initialize() here!
      // The server is the source of truth for meta.pages.
      // Calling initialize() would create an empty pages array locally
      // which could conflict with the server data during Yjs merge.

      this._isConnected = true;
    } catch {
      // Engine might not be available yet - this is ok, we'll retry later
    }
  }

  /**
   * Check if the space root doc is connected to the sync engine.
   */
  get isConnected() {
    return this._isConnected;
  }

  override dispose() {
    // The Yjs doc will be garbage collected, but we should
    // explicitly mark as disconnected
    this._isConnected = false;
    super.dispose();
  }
}
