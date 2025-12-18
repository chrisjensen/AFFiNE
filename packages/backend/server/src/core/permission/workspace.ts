import { Injectable } from '@nestjs/common';

import { SpaceAccessDenied } from '../../base';
import { DocRole, Models } from '../../models';
import { AccessController } from './controller';
import type { Resource } from './resource';
import {
  fixupDocRole,
  mapDocRoleToPermissions,
  mapWorkspaceRoleToPermissions,
  WorkspaceAction,
  workspaceActionRequiredRole,
  WorkspaceRole,
} from './types';

@Injectable()
export class WorkspaceAccessController extends AccessController<'ws'> {
  protected readonly type = 'ws';

  constructor(private readonly models: Models) {
    super();
  }

  async role(resource: Resource<'ws'>) {
    let role = await this.getRole(resource);

    // NOTE(@forehalo): special case for public page
    // Currently, we can not only load binary of a public Doc to render in a shared page,
    // so we need to ensure anyone has basic 'read' permission to a workspace that has public pages.
    if (!role && (await this.models.doc.hasPublic(resource.workspaceId))) {
      role = WorkspaceRole.External;
    }

    return {
      role,
      permissions: mapWorkspaceRoleToPermissions(role),
    };
  }

  async can(resource: Resource<'ws'>, action: WorkspaceAction) {
    const { permissions, role } = await this.role(resource);
    const allow = permissions[action] || false;

    if (!allow) {
      this.logger.debug('Workspace access check failed', {
        action,
        resource,
        role,
        requiredRole: workspaceActionRequiredRole(action),
      });
    }

    return allow;
  }

  async assert(resource: Resource<'ws'>, action: WorkspaceAction) {
    const allow = await this.can(resource, action);

    if (!allow) {
      throw new SpaceAccessDenied({ spaceId: resource.workspaceId });
    }
  }

  async getRole(payload: Resource<'ws'>) {
    const userRole = await this.models.workspaceUser.getActive(
      payload.workspaceId,
      payload.userId
    );

    let role = userRole?.type as WorkspaceRole | null;

    if (!role) {
      role = await this.defaultWorkspaceRole(payload);
    }

    return role;
  }

  async docRoles(payload: Resource<'ws'>, docIds: string[]) {
    const docRoles = await this.getDocRoles(payload, docIds);
    return docRoles.map(role => ({
      role,
      permissions: mapDocRoleToPermissions(role),
    }));
  }

  async getDocRoles(payload: Resource<'ws'>, docIds: string[]) {
    const docRoles: (DocRole | null)[] = [];

    if (docIds.length === 0) {
      return docRoles;
    }

    const workspaceRole = await this.getRole(payload);

    // Check which docs are in spaces and if user has access to those spaces
    const docSpaceAccessMap = await this.checkDocSpaceAccess(
      payload,
      docIds,
      workspaceRole
    );

    const userRoles = await this.models.docUser.findMany(
      payload.workspaceId,
      docIds,
      payload.userId
    );
    const userRolesMap = new Map(userRoles.map(role => [role.docId, role]));

    const noUserRoleDocIds = docIds.filter(docId => {
      const userRole = userRolesMap.get(docId);
      return (userRole?.type ?? null) === null;
    });
    const defaultDocRoles =
      noUserRoleDocIds.length > 0
        ? await this.getDocDefaultRoles(
            payload,
            noUserRoleDocIds,
            workspaceRole
          )
        : [];
    const defaultDocRolesMap = new Map(
      defaultDocRoles.map((role, index) => [noUserRoleDocIds[index], role])
    );

    for (const docId of docIds) {
      // If doc is in a space the user doesn't have access to, deny access
      const spaceAccess = docSpaceAccessMap.get(docId);
      if (spaceAccess === false) {
        docRoles.push(null);
        continue;
      }

      const userRole = userRolesMap.get(docId);

      let docRole: DocRole | null = userRole?.type ?? null;

      // fallback logic
      if (docRole === null) {
        docRole = defaultDocRolesMap.get(docId) ?? null;
      }

      // we need to fixup doc role to make sure it's not miss set
      // for example: workspace owner will have doc owner role
      //              workspace external will not have role higher than editor
      const role = fixupDocRole(workspaceRole, docRole);

      // never return [None]
      docRoles.push(role === DocRole.None ? null : role);
    }

    return docRoles;
  }

  /**
   * Check if user has access to the spaces that contain the given docs.
   * Returns a Map of docId -> hasAccess (true/false, undefined if doc is not in a space).
   *
   * Note: With the Space-as-Container architecture, docs are stored with containerSpaceId
   * and the sync gateway enforces boundaries at the storage layer. This method provides
   * defense-in-depth for non-sync APIs (GraphQL queries, etc.) as an additional security layer.
   */
  private async checkDocSpaceAccess(
    payload: Resource<'ws'>,
    docIds: string[],
    workspaceRole: WorkspaceRole | null
  ): Promise<Map<string, boolean | undefined>> {
    const result = new Map<string, boolean | undefined>();

    // Workspace owner always has access to all spaces
    if (workspaceRole === WorkspaceRole.Owner) {
      for (const docId of docIds) {
        result.set(docId, undefined); // undefined means "not restricted by space"
      }
      return result;
    }

    // Get space IDs for all docs
    const docSpaceMap = await this.models.spaceDoc.getSpaceIdsForDocs(docIds);

    // Find unique space IDs
    const spaceIds = new Set<string>();
    for (const [docId, spaceId] of docSpaceMap) {
      if (spaceId) {
        spaceIds.add(spaceId);
      } else {
        // Doc is not in a space, no space restriction
        result.set(docId, undefined);
      }
    }

    if (spaceIds.size === 0) {
      return result;
    }

    // Get user's explicit roles in these spaces
    const spaceUserRoles = await this.models.spaceUser.findMany(
      Array.from(spaceIds),
      payload.userId
    );
    const userSpaceRoleMap = new Map(
      spaceUserRoles.map(r => [r.spaceId, r.type])
    );

    // Get spaces to check defaultRole
    const spacesWithoutExplicitRole = Array.from(spaceIds).filter(
      spaceId => !userSpaceRoleMap.has(spaceId)
    );
    const spaces =
      spacesWithoutExplicitRole.length > 0
        ? await this.models.space.findMany(spacesWithoutExplicitRole)
        : [];
    const spaceDefaultRoleMap = new Map(spaces.map(s => [s.id, s.defaultRole]));

    // For each doc in a space, determine access
    for (const [docId, spaceId] of docSpaceMap) {
      if (!spaceId) {
        continue; // Already handled above
      }

      // Check explicit user role first
      const explicitRole = userSpaceRoleMap.get(spaceId);
      if (explicitRole !== undefined && explicitRole !== DocRole.None) {
        result.set(docId, true);
        continue;
      }

      // Check space defaultRole (only applies to workspace members, not external)
      if (workspaceRole !== null && workspaceRole !== WorkspaceRole.External) {
        const defaultRole = spaceDefaultRoleMap.get(spaceId) ?? DocRole.None;
        // If defaultRole is not None, workspace member has access
        if (defaultRole !== DocRole.None) {
          result.set(docId, true);
          continue;
        }
      }

      // No access to this space
      result.set(docId, false);
    }

    return result;
  }

  private async getDocDefaultRoles(
    payload: Resource<'ws'>,
    docIds: string[],
    workspaceRole: WorkspaceRole | null
  ) {
    const fallbackDocRoles: (DocRole | null)[] = [];

    if (docIds.length === 0) {
      return fallbackDocRoles;
    }

    const defaultDocRoles = await this.models.doc.findDefaultRoles(
      payload.workspaceId,
      docIds
    );

    for (const defaultDocRole of defaultDocRoles) {
      let docRole: DocRole | null;
      // if user is in workspace but doc role is not set, fallback to default doc role
      if (workspaceRole !== null && workspaceRole !== WorkspaceRole.External) {
        docRole =
          defaultDocRole.external !== null
            ? // edgecase: when doc role set to [None] for workspace member, but doc is public, we should fallback to external role
              Math.max(defaultDocRole.workspace, defaultDocRole.external)
            : defaultDocRole.workspace;
      } else {
        // else fallback to external doc role
        docRole = defaultDocRole.external;
      }

      fallbackDocRoles.push(docRole);
    }

    return fallbackDocRoles;
  }

  private async defaultWorkspaceRole(payload: Resource<'ws'>) {
    const ws = await this.models.workspace.get(payload.workspaceId);

    // NOTE(@forehalo):
    //   we allow user to use online service with local workspace
    //   so we always return owner role for local workspace
    //   copilot session for local workspace is an example
    if (!ws) {
      if (payload.allowLocal) {
        return WorkspaceRole.Owner;
      }

      return null;
    }

    if (ws.public) {
      return WorkspaceRole.External;
    }

    return null;
  }
}
