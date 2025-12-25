import { faker } from '@faker-js/faker';
import type { SpaceUserRole, WorkspaceSpace } from '@prisma/client';
import { omit } from 'lodash-es';
import {
  Array as YArray,
  Doc as YDoc,
  encodeStateAsUpdate,
  Map as YMap,
} from 'yjs';

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
    const spaceName = cleanInput?.name ?? faker.company.name();

    const space = await this.db.workspaceSpace.create({
      data: {
        name: spaceName,
        description: cleanInput?.description ?? faker.lorem.sentence(),
        defaultRole: cleanInput?.defaultRole ?? DocRole.Reader,
        workspaceId: workspace.id,
      },
    });

    // Create space root document (docId = spaceId)
    // This mirrors SpaceModel.createSpaceRootDoc
    await this.createSpaceRootDoc(workspace.id, space.id, spaceName, owner?.id);

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

  /**
   * Create the root document for a space.
   * The root doc contains meta.pages array for docs in the space.
   * docId = spaceId (following the workspace root doc pattern)
   */
  private async createSpaceRootDoc(
    workspaceId: string,
    spaceId: string,
    spaceName: string,
    createdBy?: string
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
    await this.db.snapshot.create({
      data: {
        workspaceId,
        id: spaceId,
        blob: update,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: createdBy || null,
        updatedBy: createdBy || null,
      },
    });
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
