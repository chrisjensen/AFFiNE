import assert from 'node:assert';

import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type { SpaceUserRole } from '@prisma/client';

import { PaginationInput } from '../base';
import { BaseModel } from './base';
import { DocRole } from './common';

// Space roles use the same DocRole enum
export { DocRole as SpaceRole };

@Injectable()
export class SpaceUserModel extends BaseModel {
  /**
   * Set or update the [Owner] of a space.
   * The old [Owner] will be changed to [Manager] if there is already an [Owner].
   */
  @Transactional()
  async setOwner(spaceId: string, userId: string) {
    const oldOwner = await this.db.spaceUserRole.findFirst({
      where: {
        spaceId,
        type: DocRole.Owner,
      },
    });

    if (oldOwner) {
      await this.db.spaceUserRole.update({
        where: {
          spaceId_userId: {
            spaceId,
            userId: oldOwner.userId,
          },
        },
        data: {
          type: DocRole.Manager,
        },
      });
    }

    await this.db.spaceUserRole.upsert({
      where: {
        spaceId_userId: {
          spaceId,
          userId,
        },
      },
      update: {
        type: DocRole.Owner,
      },
      create: {
        spaceId,
        userId,
        type: DocRole.Owner,
      },
    });

    if (oldOwner) {
      this.logger.log(
        `Transfer space owner of [${spaceId}] from [${oldOwner.userId}] to [${userId}]`
      );
    } else {
      this.logger.log(`Set space owner of [${spaceId}] to [${userId}]`);
    }
  }

  /**
   * Set or update the Role of a user in a space.
   *
   * NOTE: do not use this method to set the [Owner] of a space. Use {@link setOwner} instead.
   */
  @Transactional()
  async set(spaceId: string, userId: string, role: DocRole) {
    // internal misuse, throw directly
    assert(
      role !== DocRole.Owner,
      'Cannot set Owner role of a space to a user.'
    );

    const oldRole = await this.get(spaceId, userId);

    if (oldRole && oldRole.type === role) {
      return oldRole;
    }

    const newRole = await this.db.spaceUserRole.upsert({
      where: {
        spaceId_userId: {
          spaceId,
          userId,
        },
      },
      update: {
        type: role,
      },
      create: {
        spaceId,
        userId,
        type: role,
      },
    });

    return newRole;
  }

  async batchSetUserRoles(spaceId: string, userIds: string[], role: DocRole) {
    if (userIds.length === 0) {
      return 0;
    }

    assert(
      role !== DocRole.Owner,
      'Cannot batch set Owner role of a space to users.'
    );

    const result = await this.db.spaceUserRole.createMany({
      skipDuplicates: true,
      data: userIds.map(userId => ({
        spaceId,
        userId,
        type: role,
      })),
    });

    return result.count;
  }

  async delete(spaceId: string, userId: string) {
    await this.db.spaceUserRole.deleteMany({
      where: {
        spaceId,
        userId,
      },
    });
  }

  async deleteByUserId(userId: string) {
    await this.db.spaceUserRole.deleteMany({
      where: {
        userId,
      },
    });
  }

  async getOwner(spaceId: string) {
    return await this.db.spaceUserRole.findFirst({
      where: {
        spaceId,
        type: DocRole.Owner,
      },
    });
  }

  async get(spaceId: string, userId: string) {
    return await this.db.spaceUserRole.findUnique({
      where: {
        spaceId_userId: {
          spaceId,
          userId,
        },
      },
    });
  }

  async findMany(spaceIds: string[], userId: string) {
    return await this.db.spaceUserRole.findMany({
      where: {
        spaceId: { in: spaceIds },
        userId,
      },
    });
  }

  async findByUser(userId: string) {
    return await this.db.spaceUserRole.findMany({
      where: { userId },
    });
  }

  count(spaceId: string) {
    return this.db.spaceUserRole.count({
      where: { spaceId },
    });
  }

  async paginate(
    spaceId: string,
    pagination: PaginationInput
  ): Promise<[SpaceUserRole[], number]> {
    return await Promise.all([
      this.db.spaceUserRole.findMany({
        where: {
          spaceId,
          createdAt: pagination.after ? { gte: pagination.after } : undefined,
        },
        orderBy: { createdAt: 'asc' },
        take: pagination.first,
        skip: pagination.offset + (pagination.after ? 1 : 0),
      }),
      this.count(spaceId),
    ]);
  }
}
