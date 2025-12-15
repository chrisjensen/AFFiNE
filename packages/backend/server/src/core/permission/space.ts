import { Injectable } from '@nestjs/common';

import { SpaceAccessDenied } from '../../base';
import { DocRole, Models } from '../../models';
import { AccessController, getAccessController } from './controller';
import type { Resource } from './resource';
import {
  mapSpaceRoleToPermissions,
  SpaceAction,
  spaceActionRequiredRole,
  SpaceRole,
  WorkspaceRole,
} from './types';
import { WorkspaceAccessController } from './workspace';

@Injectable()
export class SpaceAccessController extends AccessController<'space'> {
  protected readonly type = 'space';

  constructor(private readonly models: Models) {
    super();
  }

  async role(resource: Resource<'space'>) {
    const role = await this.getRole(resource);

    return {
      role,
      permissions: mapSpaceRoleToPermissions(role),
    };
  }

  async can(resource: Resource<'space'>, action: SpaceAction) {
    const { permissions, role } = await this.role(resource);
    const allow = permissions[action] || false;

    if (!allow) {
      this.logger.debug('Space access check failed', {
        action,
        resource,
        role,
        requiredRole: spaceActionRequiredRole(action),
      });
    }

    return allow;
  }

  async assert(resource: Resource<'space'>, action: SpaceAction) {
    const allow = await this.can(resource, action);

    if (!allow) {
      throw new SpaceAccessDenied({ spaceId: resource.spaceId });
    }
  }

  async getRole(payload: Resource<'space'>): Promise<SpaceRole | null> {
    // First check workspace-level permission
    const workspaceController = getAccessController(
      'ws'
    ) as WorkspaceAccessController;
    const { role: workspaceRole } = await workspaceController.role({
      workspaceId: payload.workspaceId,
      userId: payload.userId,
    });

    // Workspace Owner/Admin get elevated space permissions
    if (workspaceRole === WorkspaceRole.Owner) {
      return DocRole.Owner;
    }
    if (workspaceRole === WorkspaceRole.Admin) {
      return DocRole.Manager;
    }

    // Check explicit space permission
    const spaceUserRole = await this.models.spaceUser.get(
      payload.spaceId,
      payload.userId
    );

    if (spaceUserRole) {
      return spaceUserRole.type as SpaceRole;
    }

    // Fall back to space's default role for workspace members
    if (workspaceRole !== null && workspaceRole !== WorkspaceRole.External) {
      const space = await this.models.space.get(payload.spaceId);
      if (space) {
        return space.defaultRole as SpaceRole;
      }
    }

    // No access
    return null;
  }
}
