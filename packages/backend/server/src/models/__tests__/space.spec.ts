import test from 'ava';

import { createModule } from '../../__tests__/create-module';
import { Mockers } from '../../__tests__/mocks';
import { DocRole, Models } from '..';

const module = await createModule();
const models = module.get(Models);

test.after.always(async () => {
  await module.close();
});

// Space Model Tests
test('should create a space', async t => {
  const user = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  const space = await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
    description: 'A test space',
  });

  t.truthy(space.id);
  t.is(space.workspaceId, workspace.id);
  t.is(space.name, 'Test Space');
  t.is(space.description, 'A test space');
  t.is(space.defaultRole, DocRole.Reader); // Default
});

test('should create a space with custom default role', async t => {
  const user = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  const space = await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Private Space',
    defaultRole: DocRole.External,
  });

  t.is(space.defaultRole, DocRole.External);
});

test('should get a space by ID', async t => {
  const user = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  const created = await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  const found = await models.space.get(created.id);
  t.truthy(found);
  t.is(found?.id, created.id);
  t.is(found?.name, 'Test Space');
});

test('should return null for non-existent space', async t => {
  const found = await models.space.get('non-existent-id');
  t.is(found, null);
});

test('should list spaces by workspace', async t => {
  const user = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Space 1',
  });
  await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Space 2',
  });

  const spaces = await models.space.listByWorkspace(workspace.id);
  t.is(spaces.length, 2);
});

test('should update a space', async t => {
  const user = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  const space = await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Original Name',
  });

  const updated = await models.space.update(space.id, {
    name: 'Updated Name',
    description: 'Updated description',
  });

  t.is(updated.name, 'Updated Name');
  t.is(updated.description, 'Updated description');
});

test('should delete a space', async t => {
  const user = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  const space = await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'To Delete',
  });

  await models.space.delete(space.id);

  const found = await models.space.get(space.id);
  t.is(found, null);
});

// SpaceUser Model Tests
test('should set user role in space', async t => {
  const user = await module.create(Mockers.User);
  const member = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  const space = await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  await models.spaceUser.set(space.id, member.id, DocRole.Editor);

  const role = await models.spaceUser.get(space.id, member.id);
  t.truthy(role);
  t.is(role?.type, DocRole.Editor);
});

test('should get user role in space', async t => {
  const user = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  const space = await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  // Creator gets owner role
  const role = await models.spaceUser.get(space.id, user.id);
  t.truthy(role);
  t.is(role?.type, DocRole.Owner);
});

test('should delete user role from space', async t => {
  const user = await module.create(Mockers.User);
  const member = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  const space = await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  await models.spaceUser.set(space.id, member.id, DocRole.Editor);
  await models.spaceUser.delete(space.id, member.id);

  const role = await models.spaceUser.get(space.id, member.id);
  t.is(role, null);
});

test('should get space owner', async t => {
  const user = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  const space = await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  const owner = await models.spaceUser.getOwner(space.id);
  t.truthy(owner);
  t.is(owner?.userId, user.id);
});

test('should transfer space ownership', async t => {
  const user = await module.create(Mockers.User);
  const newOwner = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  const space = await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  await models.spaceUser.setOwner(space.id, newOwner.id);

  const owner = await models.spaceUser.getOwner(space.id);
  t.is(owner?.userId, newOwner.id);

  // Previous owner should be downgraded to Manager
  const previousOwnerRole = await models.spaceUser.get(space.id, user.id);
  t.is(previousOwnerRole?.type, DocRole.Manager);
});

// SpaceDoc Model Tests
test('should add doc to space', async t => {
  const user = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  const space = await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  const docId = 'test-doc-id';
  await models.spaceDoc.add(space.id, docId);

  const spaceId = await models.spaceDoc.getSpaceId(docId);
  t.is(spaceId, space.id);
});

test('should get space ID for doc', async t => {
  const user = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  const space = await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  const docId = 'test-doc-id-2';
  await models.spaceDoc.add(space.id, docId);

  const spaceId = await models.spaceDoc.getSpaceId(docId);
  t.is(spaceId, space.id);
});

test('should return null for doc not in any space', async t => {
  const spaceId = await models.spaceDoc.getSpaceId('non-existent-doc');
  t.is(spaceId, null);
});

test('should move doc to different space', async t => {
  const user = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  const space1 = await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Space 1',
  });

  const space2 = await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Space 2',
  });

  const docId = 'test-doc-to-move';
  await models.spaceDoc.add(space1.id, docId);
  await models.spaceDoc.moveDoc(docId, space2.id);

  const newSpaceId = await models.spaceDoc.getSpaceId(docId);
  t.is(newSpaceId, space2.id);
});

test('should move doc to workspace root (null space)', async t => {
  const user = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  const space = await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  const docId = 'test-doc-to-root';
  await models.spaceDoc.add(space.id, docId);
  await models.spaceDoc.moveDoc(docId, null);

  const spaceId = await models.spaceDoc.getSpaceId(docId);
  t.is(spaceId, null);
});

test('should count docs in space', async t => {
  const user = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  const space = await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  await models.spaceDoc.add(space.id, 'doc-1');
  await models.spaceDoc.add(space.id, 'doc-2');
  await models.spaceDoc.add(space.id, 'doc-3');

  const count = await models.spaceDoc.count(space.id);
  t.is(count, 3);
});

test('should list docs in space', async t => {
  const user = await module.create(Mockers.User);
  const workspace = await module.create(Mockers.Workspace, {
    owner: { id: user.id },
  });

  const space = await models.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  await models.spaceDoc.add(space.id, 'doc-a');
  await models.spaceDoc.add(space.id, 'doc-b');

  const docIds = await models.spaceDoc.list(space.id);
  t.is(docIds.length, 2);
  t.true(docIds.includes('doc-a'));
  t.true(docIds.includes('doc-b'));
});
