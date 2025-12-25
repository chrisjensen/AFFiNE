import { Entity, LiveData } from '@toeverything/infra';

import {
  type DocRole,
  numericToDocRole,
  type SpaceIconData,
  type SpaceInfo,
  type SpaceStore,
} from '../stores/space';

/**
 * Space entity represents a space (folder/container) within a workspace.
 *
 * Space membership is tracked by the SpaceDoc table on the backend.
 * The server is the single source of truth for which docs belong to a space.
 */
export class Space extends Entity<{ spaceInfo: SpaceInfo }> {
  constructor(private readonly store: SpaceStore) {
    super();
  }

  readonly id = this.props.spaceInfo.id;
  readonly workspaceId = this.props.spaceInfo.workspaceId;

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

  // Doc IDs from server response (single source of truth)
  readonly docIds$ = this.info$.map((info: SpaceInfo) => info.docIds ?? []);

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

  async updateIcon(icon: SpaceIconData) {
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
}
