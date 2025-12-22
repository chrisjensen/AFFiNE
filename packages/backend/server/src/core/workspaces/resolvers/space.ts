import { Logger } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import type { Prisma } from '@prisma/client';
import { GraphQLJSONObject } from 'graphql-scalars';

import {
  paginate,
  Paginated,
  PaginationInput,
  registerObjectType,
  SpaceAccessDenied,
  SpaceNotFound,
} from '../../../base';
import { DocRole, Models } from '../../../models';
import { CurrentUser } from '../../auth';
import { AccessController, SPACE_ACTIONS, SpaceAction } from '../../permission';
import { PublicUserType, WorkspaceUserType } from '../../user';
import { WorkspaceType } from '../types';
import {
  DotToUnderline,
  mapPermissionsToGraphqlPermissions,
} from './workspace';

const SpacePermissions = registerObjectType<
  Record<DotToUnderline<SpaceAction>, boolean>
>(
  Object.fromEntries(
    SPACE_ACTIONS.map(action => [
      action.replaceAll('.', '_'),
      {
        type: () => Boolean,
        options: {
          name: action.replaceAll('.', '_'),
        },
      },
    ])
  ),
  { name: 'SpacePermissions' }
);

@ObjectType()
export class SpaceType {
  @Field(() => ID)
  id!: string;

  @Field()
  workspaceId!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  avatarKey?: string | null;

  @Field(() => GraphQLJSONObject, { nullable: true })
  icon?: Prisma.JsonValue;

  @Field(() => Int)
  defaultRole!: number;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
class PaginatedSpaceType extends Paginated(SpaceType) {}

@ObjectType()
class GrantedSpaceUserType {
  @Field(() => DocRole, { name: 'role' })
  type!: DocRole;

  @Field(() => WorkspaceUserType)
  user!: WorkspaceUserType;
}

@ObjectType()
class PaginatedGrantedSpaceUserType extends Paginated(GrantedSpaceUserType) {}

@InputType()
class CreateSpaceInput {
  @Field()
  workspaceId!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  icon?: Prisma.InputJsonValue;

  @Field(() => DocRole, { nullable: true })
  defaultRole?: DocRole;
}

@InputType()
class UpdateSpaceInput {
  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  icon?: Prisma.InputJsonValue;

  @Field(() => DocRole, { nullable: true })
  defaultRole?: DocRole;
}

@InputType()
class GrantSpaceUserRoleInput {
  @Field()
  spaceId!: string;

  @Field()
  userId!: string;

  @Field(() => DocRole)
  role!: DocRole;
}

@InputType()
class RevokeSpaceUserRoleInput {
  @Field()
  spaceId!: string;

  @Field()
  userId!: string;
}

@InputType()
class MoveDocToSpaceInput {
  @Field()
  workspaceId!: string;

  @Field()
  docId!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Target space ID, null to move to workspace root',
  })
  spaceId?: string | null;
}

/**
 * Workspace Space Resolver - queries spaces within a workspace
 */
@Resolver(() => WorkspaceType)
export class WorkspaceSpaceResolver {
  constructor(
    private readonly ac: AccessController,
    private readonly models: Models
  ) {}

  @ResolveField(() => [SpaceType], {
    description: 'Get all accessible spaces in the workspace',
  })
  async spaces(
    @CurrentUser() user: CurrentUser,
    @Parent() workspace: WorkspaceType
  ): Promise<SpaceType[]> {
    // Check workspace access first
    await this.ac
      .user(user.id)
      .workspace(workspace.id)
      .assert('Workspace.Read');

    // Get all spaces in the workspace
    const allSpaces = await this.models.space.listByWorkspace(workspace.id);

    // Filter to only spaces the user has access to
    const accessibleSpaces: SpaceType[] = [];
    for (const space of allSpaces) {
      const canRead = await this.ac
        .user(user.id)
        .space(workspace.id, space.id)
        .can('Space.Read');
      if (canRead) {
        accessibleSpaces.push(space);
      }
    }

    return accessibleSpaces;
  }

  @ResolveField(() => PaginatedSpaceType, {
    description: 'Get paginated spaces in the workspace',
  })
  async paginatedSpaces(
    @CurrentUser() user: CurrentUser,
    @Parent() workspace: WorkspaceType,
    @Args('pagination', PaginationInput.decode) pagination: PaginationInput
  ): Promise<PaginatedSpaceType> {
    await this.ac
      .user(user.id)
      .workspace(workspace.id)
      .assert('Workspace.Read');

    const [spaces, totalCount] = await this.models.space.paginate(
      workspace.id,
      pagination
    );

    // Filter to only spaces the user has access to
    const accessibleSpaces: SpaceType[] = [];
    for (const space of spaces) {
      const canRead = await this.ac
        .user(user.id)
        .space(workspace.id, space.id)
        .can('Space.Read');
      if (canRead) {
        accessibleSpaces.push(space);
      }
    }

    return paginate(accessibleSpaces, 'createdAt', pagination, totalCount);
  }

  @ResolveField(() => SpaceType, {
    description: 'Get a specific space by ID',
    nullable: true,
  })
  async space(
    @CurrentUser() user: CurrentUser,
    @Parent() workspace: WorkspaceType,
    @Args('spaceId') spaceId: string
  ): Promise<SpaceType | null> {
    const space = await this.models.space.get(spaceId);
    if (!space || space.workspaceId !== workspace.id) {
      return null;
    }

    await this.ac
      .user(user.id)
      .space(workspace.id, spaceId)
      .assert('Space.Read');

    return space;
  }

  @ResolveField(() => [String], {
    description:
      'Get doc IDs that are hidden from the user (in inaccessible spaces)',
  })
  async hiddenDocIds(
    @CurrentUser() user: CurrentUser,
    @Parent() workspace: WorkspaceType
  ): Promise<string[]> {
    // Check workspace access first
    await this.ac
      .user(user.id)
      .workspace(workspace.id)
      .assert('Workspace.Read');

    // Get all spaces in the workspace
    const allSpaces = await this.models.space.listByWorkspace(workspace.id);

    // Find inaccessible spaces
    const inaccessibleSpaceIds: string[] = [];
    for (const space of allSpaces) {
      const canRead = await this.ac
        .user(user.id)
        .space(workspace.id, space.id)
        .can('Space.Read');
      if (!canRead) {
        inaccessibleSpaceIds.push(space.id);
      }
    }

    if (inaccessibleSpaceIds.length === 0) {
      return [];
    }

    // Get all doc IDs from inaccessible spaces
    const hiddenDocIds: string[] = [];
    for (const spaceId of inaccessibleSpaceIds) {
      const docIds = await this.models.spaceDoc.getDocIds(spaceId);
      hiddenDocIds.push(...docIds);
    }

    return hiddenDocIds;
  }
}

/**
 * Space Resolver - operations on individual spaces
 */
@Resolver(() => SpaceType)
export class SpaceResolver {
  private readonly logger = new Logger(SpaceResolver.name);

  constructor(
    private readonly ac: AccessController,
    private readonly models: Models
  ) {}

  @ResolveField(() => DocRole, {
    description: 'Current user role in this space',
  })
  async role(
    @CurrentUser() user: CurrentUser,
    @Parent() space: SpaceType
  ): Promise<DocRole> {
    const { role } = await this.ac
      .user(user.id)
      .space(space.workspaceId, space.id)
      .permissions();

    return role ?? DocRole.External;
  }

  @ResolveField(() => SpacePermissions, {
    description: 'Current user permissions in this space',
  })
  async permissions(
    @CurrentUser() user: CurrentUser,
    @Parent() space: SpaceType
  ): Promise<InstanceType<typeof SpacePermissions>> {
    const { permissions } = await this.ac
      .user(user.id)
      .space(space.workspaceId, space.id)
      .permissions();

    return mapPermissionsToGraphqlPermissions(permissions);
  }

  @ResolveField(() => PublicUserType, {
    nullable: true,
    description: 'Space owner',
  })
  async owner(@Parent() space: SpaceType): Promise<PublicUserType | null> {
    const owner = await this.models.spaceUser.getOwner(space.id);
    if (!owner) {
      return null;
    }
    return this.models.user.get(owner.userId);
  }

  @ResolveField(() => PaginatedGrantedSpaceUserType, {
    description: 'Paginated list of users with explicit space permissions',
  })
  async members(
    @CurrentUser() user: CurrentUser,
    @Parent() space: SpaceType,
    @Args('pagination', PaginationInput.decode) pagination: PaginationInput
  ): Promise<PaginatedGrantedSpaceUserType> {
    await this.ac
      .user(user.id)
      .space(space.workspaceId, space.id)
      .assert('Space.Users.Read');

    const [permissions, totalCount] = await this.models.spaceUser.paginate(
      space.id,
      pagination
    );

    const users = await this.models.user.getWorkspaceUsers(
      permissions.map(p => p.userId)
    );
    const usersMap = new Map(users.map(u => [u.id, u]));

    return paginate(
      permissions.map(p => ({
        ...p,
        user: usersMap.get(p.userId) as WorkspaceUserType,
      })),
      'createdAt',
      pagination,
      totalCount
    );
  }

  @ResolveField(() => Int, {
    description: 'Number of docs in this space',
  })
  async docCount(
    @CurrentUser() user: CurrentUser,
    @Parent() space: SpaceType
  ): Promise<number> {
    // Defense-in-depth: verify user has space read access
    await this.ac
      .user(user.id)
      .space(space.workspaceId, space.id)
      .assert('Space.Read');

    return this.models.spaceDoc.count(space.id);
  }

  @ResolveField(() => [String], {
    description: 'IDs of docs in this space',
  })
  async docIds(
    @CurrentUser() user: CurrentUser,
    @Parent() space: SpaceType
  ): Promise<string[]> {
    // Defense-in-depth: verify user has space read access
    await this.ac
      .user(user.id)
      .space(space.workspaceId, space.id)
      .assert('Space.Read');

    return this.models.spaceDoc.getDocIds(space.id);
  }

  @Query(() => SpaceType, {
    description: 'Get a space by ID',
  })
  async getSpace(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('spaceId') spaceId: string
  ): Promise<SpaceType> {
    const space = await this.models.space.get(spaceId);
    if (!space || space.workspaceId !== workspaceId) {
      throw new SpaceNotFound({ spaceId });
    }

    await this.ac
      .user(user.id)
      .space(workspaceId, spaceId)
      .assert('Space.Read');

    return space;
  }

  @Mutation(() => SpaceType, {
    description: 'Create a new space in a workspace',
  })
  async createSpace(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: CreateSpaceInput
  ): Promise<SpaceType> {
    // User needs CreateDoc permission on workspace to create spaces
    await this.ac
      .user(user.id)
      .workspace(input.workspaceId)
      .assert('Workspace.CreateDoc');

    const space = await this.models.space.create(user.id, {
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description,
      defaultRole: input.defaultRole,
    });

    this.logger.log(
      `Created space [${space.id}] in workspace [${input.workspaceId}]`
    );

    return space;
  }

  @Mutation(() => SpaceType, {
    description: 'Update space settings',
  })
  async updateSpace(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('spaceId') spaceId: string,
    @Args('input') input: UpdateSpaceInput
  ): Promise<SpaceType> {
    const space = await this.models.space.get(spaceId);
    if (!space || space.workspaceId !== workspaceId) {
      throw new SpaceNotFound({ spaceId });
    }

    await this.ac
      .user(user.id)
      .space(workspaceId, spaceId)
      .assert('Space.Settings.Update');

    const updated = await this.models.space.update(spaceId, {
      name: input.name ?? undefined,
      description: input.description ?? undefined,
      icon: input.icon ?? undefined,
      defaultRole: input.defaultRole ?? undefined,
    });

    this.logger.log(`Updated space [${spaceId}]`);

    return updated;
  }

  @Mutation(() => Boolean, {
    description: 'Delete a space',
  })
  async deleteSpace(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('spaceId') spaceId: string
  ): Promise<boolean> {
    const space = await this.models.space.get(spaceId);
    if (!space || space.workspaceId !== workspaceId) {
      throw new SpaceNotFound({ spaceId });
    }

    await this.ac
      .user(user.id)
      .space(workspaceId, spaceId)
      .assert('Space.Delete');

    await this.models.space.delete(spaceId);

    this.logger.log(
      `Deleted space [${spaceId}] from workspace [${workspaceId}]`
    );

    return true;
  }

  @Mutation(() => Boolean, {
    description: 'Grant a user role in a space',
  })
  async grantSpaceUserRole(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('input') input: GrantSpaceUserRoleInput
  ): Promise<boolean> {
    const space = await this.models.space.get(input.spaceId);
    if (!space || space.workspaceId !== workspaceId) {
      throw new SpaceNotFound({ spaceId: input.spaceId });
    }

    if (input.role === DocRole.Owner) {
      await this.ac
        .user(user.id)
        .space(workspaceId, input.spaceId)
        .assert('Space.TransferOwner');
      await this.models.spaceUser.setOwner(input.spaceId, input.userId);
    } else {
      await this.ac
        .user(user.id)
        .space(workspaceId, input.spaceId)
        .assert('Space.Users.Manage');
      await this.models.spaceUser.set(input.spaceId, input.userId, input.role);
    }

    this.logger.log(
      `Granted role [${input.role}] to user [${input.userId}] in space [${input.spaceId}]`
    );

    return true;
  }

  @Mutation(() => Boolean, {
    description: 'Revoke a user role from a space',
  })
  async revokeSpaceUserRole(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('input') input: RevokeSpaceUserRoleInput
  ): Promise<boolean> {
    const space = await this.models.space.get(input.spaceId);
    if (!space || space.workspaceId !== workspaceId) {
      throw new SpaceNotFound({ spaceId: input.spaceId });
    }

    await this.ac
      .user(user.id)
      .space(workspaceId, input.spaceId)
      .assert('Space.Users.Manage');

    // Check if trying to remove owner
    const existingRole = await this.models.spaceUser.get(
      input.spaceId,
      input.userId
    );
    if (existingRole?.type === DocRole.Owner) {
      throw new SpaceAccessDenied({ spaceId: input.spaceId });
    }

    await this.models.spaceUser.delete(input.spaceId, input.userId);

    this.logger.log(
      `Revoked role from user [${input.userId}] in space [${input.spaceId}]`
    );

    return true;
  }

  @Mutation(() => Boolean, {
    description:
      'Move a doc to a space (or to workspace root if spaceId is null)',
  })
  async moveDocToSpace(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: MoveDocToSpaceInput
  ): Promise<boolean> {
    // Check doc write permission
    await this.ac
      .user(user.id)
      .doc(input.workspaceId, input.docId)
      .assert('Doc.Update');

    // If moving to a space, check space access
    if (input.spaceId) {
      const space = await this.models.space.get(input.spaceId);
      if (!space || space.workspaceId !== input.workspaceId) {
        throw new SpaceNotFound({ spaceId: input.spaceId });
      }

      await this.ac
        .user(user.id)
        .space(input.workspaceId, input.spaceId)
        .assert('Space.CreateDoc');
    }

    await this.models.spaceDoc.moveDoc(
      input.workspaceId,
      input.docId,
      input.spaceId ?? null
    );

    this.logger.log(
      `Moved doc [${input.docId}] to ${input.spaceId ? `space [${input.spaceId}]` : 'workspace root'}`
    );

    return true;
  }
}
