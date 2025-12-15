import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { WorkspaceSpace } from '@prisma/client';

import { EventBus, PaginationInput } from '../base';
import { BaseModel } from './base';
import { DocRole } from './common';

declare global {
  interface Events {
    'space.created': WorkspaceSpace;
    'space.updated': WorkspaceSpace;
    'space.deleted': {
      id: string;
      workspaceId: string;
    };
  }
}

export type { WorkspaceSpace as Space };

export interface CreateSpaceInput {
  workspaceId: string;
  name: string;
  description?: string;
  avatarKey?: string;
  defaultRole?: DocRole;
}

export interface UpdateSpaceInput {
  name?: string;
  description?: string;
  avatarKey?: string;
  defaultRole?: DocRole;
}

@Injectable()
export class SpaceModel extends BaseModel {
  constructor(private readonly event: EventBus) {
    super();
  }

  /**
   * Create a new space in a workspace.
   * The creator will be set as the owner of the space.
   */
  @Transactional()
  async create(userId: string, input: CreateSpaceInput) {
    const space = await this.db.workspaceSpace.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description,
        avatarKey: input.avatarKey,
        defaultRole: input.defaultRole ?? DocRole.Manager,
      },
    });

    this.logger.log(
      `Space created [${space.id}] in workspace [${input.workspaceId}]`
    );

    // Set the creator as the owner of the space
    await this.models.spaceUser.setOwner(space.id, userId);

    this.event.emit('space.created', space);
    return space;
  }

  async get(spaceId: string) {
    return await this.db.workspaceSpace.findUnique({
      where: { id: spaceId },
    });
  }

  async findMany(spaceIds: string[]) {
    return await this.db.workspaceSpace.findMany({
      where: { id: { in: spaceIds } },
    });
  }

  async listByWorkspace(workspaceId: string) {
    return await this.db.workspaceSpace.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(spaceId: string, data: UpdateSpaceInput) {
    const space = await this.db.workspaceSpace.update({
      where: { id: spaceId },
      data,
    });

    this.logger.debug(`Updated space [${spaceId}]`);
    this.event.emit('space.updated', space);
    return space;
  }

  async delete(spaceId: string) {
    const space = await this.get(spaceId);
    if (!space) {
      return;
    }

    await this.db.workspaceSpace.delete({
      where: { id: spaceId },
    });

    this.event.emit('space.deleted', {
      id: spaceId,
      workspaceId: space.workspaceId,
    });
    this.logger.log(`Space [${spaceId}] deleted`);
  }

  async paginate(
    workspaceId: string,
    pagination: PaginationInput
  ): Promise<[WorkspaceSpace[], number]> {
    return await Promise.all([
      this.db.workspaceSpace.findMany({
        where: {
          workspaceId,
          createdAt: pagination.after ? { gte: pagination.after } : undefined,
        },
        orderBy: { createdAt: 'asc' },
        take: pagination.first,
        skip: pagination.offset + (pagination.after ? 1 : 0),
      }),
      this.db.workspaceSpace.count({ where: { workspaceId } }),
    ]);
  }
}
