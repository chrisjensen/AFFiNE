import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { WorkspaceSpace } from '@prisma/client';
import {
  Array as YArray,
  Doc as YDoc,
  encodeStateAsUpdate,
  Map as YMap,
} from 'yjs';

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
  icon?: string;
  defaultRole?: DocRole;
}

export interface UpdateSpaceInput {
  name?: string;
  description?: string;
  avatarKey?: string;
  icon?: string;
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
   * Also creates the space root document (docId = spaceId).
   */
  @Transactional()
  async create(userId: string, input: CreateSpaceInput) {
    const space = await this.db.workspaceSpace.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description,
        avatarKey: input.avatarKey,
        icon: input.icon,
        defaultRole: input.defaultRole ?? DocRole.Manager,
      },
    });

    this.logger.log(
      `Space created [${space.id}] in workspace [${input.workspaceId}]`
    );

    // Create the space root document (docId = spaceId, following workspace pattern)
    await this.createSpaceRootDoc(input.workspaceId, space.id, input.name);

    // Set the creator as the owner of the space
    await this.models.spaceUser.setOwner(space.id, userId);

    this.event.emit('space.created', space);
    return space;
  }

  /**
   * Create the root document for a space.
   * The root doc contains meta.pages array for docs in the space.
   * docId = spaceId (following the workspace root doc pattern)
   */
  private async createSpaceRootDoc(
    workspaceId: string,
    spaceId: string,
    spaceName: string
  ) {
    // Create Yjs document with spaceId as guid
    const rootDoc = new YDoc({ guid: spaceId });
    const meta = rootDoc.getMap('meta') as YMap<unknown>;

    // Initialize meta structure (similar to workspace root doc)
    meta.set('pages', new YArray());
    meta.set('name', spaceName);

    // Encode the document as update
    const update = encodeStateAsUpdate(rootDoc);

    // Store the root doc snapshot
    // The root doc is stored at workspace level (containerSpaceId = null)
    // because it IS the space, not a doc inside the space
    await this.models.doc.upsert({
      spaceId: workspaceId,
      containerSpaceId: undefined, // Root doc is at workspace level
      docId: spaceId,
      blob: update,
      timestamp: Date.now(),
    });

    this.logger.log(
      `Created space root document [${spaceId}] for space in workspace [${workspaceId}]`
    );
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

  @Transactional()
  async delete(spaceId: string) {
    const space = await this.get(spaceId);
    if (!space) {
      return;
    }

    // Delete the space root document
    await this.models.doc.delete(space.workspaceId, spaceId);

    // Delete all docs in the space (those with containerSpaceId = spaceId)
    await this.deleteAllDocsInSpace(space.workspaceId, spaceId);

    await this.db.workspaceSpace.delete({
      where: { id: spaceId },
    });

    this.event.emit('space.deleted', {
      id: spaceId,
      workspaceId: space.workspaceId,
    });
    this.logger.log(`Space [${spaceId}] deleted`);
  }

  /**
   * Delete all docs that belong to a specific space container.
   */
  private async deleteAllDocsInSpace(workspaceId: string, spaceId: string) {
    // Delete all snapshots, updates, and histories for docs in this space
    await this.db.snapshot.deleteMany({
      where: { workspaceId, spaceId },
    });
    await this.db.update.deleteMany({
      where: { workspaceId, spaceId },
    });
    await this.db.snapshotHistory.deleteMany({
      where: { workspaceId, spaceId },
    });

    this.logger.log(
      `Deleted all docs in space [${spaceId}] of workspace [${workspaceId}]`
    );
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
