import { faker } from '@faker-js/faker';
import type { SpaceUserRole, WorkspaceSpace } from '@prisma/client';
import { omit } from 'lodash-es';

import { DocRole } from '../../models';
import { Mocker } from './factory';

export type MockSpaceInput = {
  name?: string;
  description?: string;
  defaultRole?: number;
  owner?: { id: string };
  workspace: { id: string };
};

export type MockedSpace = WorkspaceSpace;

export class MockSpace extends Mocker<MockSpaceInput, MockedSpace> {
  override async create(input?: Partial<MockSpaceInput>) {
    const owner = input?.owner;
    const workspace = input?.workspace;

    if (!workspace?.id) {
      throw new Error('workspace is required for MockSpace');
    }

    const cleanInput = omit(input, 'owner', 'workspace');

    const space = await this.db.workspaceSpace.create({
      data: {
        name: cleanInput?.name ?? faker.company.name(),
        description: cleanInput?.description ?? faker.lorem.sentence(),
        defaultRole: cleanInput?.defaultRole ?? DocRole.Reader,
        workspaceId: workspace.id,
      },
    });

    // Create owner permission if provided
    if (owner?.id) {
      await this.db.spaceUserRole.create({
        data: {
          spaceId: space.id,
          userId: owner.id,
          type: DocRole.Owner,
        },
      });
    }

    return space;
  }
}

export type MockSpaceUserInput = {
  space: { id: string };
  user: { id: string };
  role?: DocRole;
};

export type MockedSpaceUser = SpaceUserRole;

export class MockSpaceUser extends Mocker<MockSpaceUserInput, MockedSpaceUser> {
  override async create(input?: Partial<MockSpaceUserInput>) {
    if (!input?.space?.id || !input?.user?.id) {
      throw new Error('space and user are required for MockSpaceUser');
    }

    return await this.db.spaceUserRole.create({
      data: {
        spaceId: input.space.id,
        userId: input.user.id,
        type: input.role ?? DocRole.Reader,
      },
    });
  }
}

export type MockSpaceDocInput = {
  space: { id: string };
  docId: string;
};

export type MockedSpaceDoc = { spaceId: string; docId: string };

export class MockSpaceDoc extends Mocker<MockSpaceDocInput, MockedSpaceDoc> {
  override async create(input?: Partial<MockSpaceDocInput>) {
    if (!input?.space?.id || !input?.docId) {
      throw new Error('space and docId are required for MockSpaceDoc');
    }

    return await this.db.spaceDoc.create({
      data: {
        spaceId: input.space.id,
        docId: input.docId,
      },
    });
  }
}
