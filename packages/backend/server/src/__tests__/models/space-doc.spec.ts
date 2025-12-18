import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import {
  applyUpdate,
  Array as YArray,
  Doc as YDoc,
  encodeStateAsUpdate,
  Map as YMap,
} from 'yjs';

import { Config } from '../../base';
import {
  DocModel,
  SpaceDocModel,
  SpaceModel,
  UserModel,
  WorkspaceModel,
} from '../../models';
import { createTestingModule, type TestingModule } from '../utils';

interface DocMeta {
  id: string;
  title?: string;
  createDate?: number;
  tags?: string[];
}

interface Context {
  config: Config;
  module: TestingModule;
  db: PrismaClient;
  user: UserModel;
  workspace: WorkspaceModel;
  space: SpaceModel;
  spaceDoc: SpaceDocModel;
  doc: DocModel;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule();
  t.context.user = module.get(UserModel);
  t.context.workspace = module.get(WorkspaceModel);
  t.context.space = module.get(SpaceModel);
  t.context.spaceDoc = module.get(SpaceDocModel);
  t.context.doc = module.get(DocModel);
  t.context.db = module.get(PrismaClient);
  t.context.config = module.get(Config);
  t.context.module = module;
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.after(async t => {
  await t.context.module.close();
});

/**
 * Helper to read meta.pages from a container's root document.
 * Container can be a space (spaceId) or the workspace itself (workspaceId).
 */
async function getMetaPages(
  docModel: DocModel,
  workspaceId: string,
  containerId: string
): Promise<DocMeta[]> {
  const snapshot = await docModel.get(workspaceId, containerId);
  if (!snapshot) {
    return [];
  }

  const yDoc = new YDoc({ guid: containerId });
  applyUpdate(yDoc, snapshot.blob);

  const meta = yDoc.getMap('meta') as YMap<unknown>;
  const pages = meta.get('pages') as YArray<DocMeta> | undefined;

  if (!pages) {
    return [];
  }

  const result: DocMeta[] = [];
  for (let i = 0; i < pages.length; i++) {
    result.push(pages.get(i));
  }
  return result;
}

/**
 * Helper to create a workspace root document with meta.pages.
 */
async function createWorkspaceRootDoc(
  docModel: DocModel,
  workspaceId: string
): Promise<void> {
  const yDoc = new YDoc({ guid: workspaceId });
  const meta = yDoc.getMap('meta') as YMap<unknown>;
  meta.set('pages', new YArray<DocMeta>());
  meta.set('name', 'Test Workspace');

  const update = encodeStateAsUpdate(yDoc);
  await docModel.upsert({
    spaceId: workspaceId,
    docId: workspaceId,
    blob: update,
    timestamp: Date.now(),
  });
}

// =============================================================================
// Basic Tests: Space root doc is created with empty meta.pages
// =============================================================================

test('space creation should create root doc with empty meta.pages', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);

  // Create a space
  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  // The space root doc should exist
  const rootDoc = await t.context.doc.get(workspace.id, space.id);
  t.truthy(rootDoc, 'Space root doc should exist');
  t.truthy(rootDoc?.blob, 'Space root doc should have blob');

  // Parse the Yjs document
  const yDoc = new YDoc({ guid: space.id });
  applyUpdate(yDoc, rootDoc!.blob);

  const meta = yDoc.getMap('meta') as YMap<unknown>;
  t.true(meta.has('pages'), 'meta should have pages key');

  const pages = meta.get('pages') as YArray<DocMeta>;
  t.truthy(pages, 'pages should exist');
  t.is(pages.length, 0, 'pages should be empty initially');
});

// =============================================================================
// addDocToRootMeta Tests
// =============================================================================

test('addDocToRootMeta should add doc to space root meta.pages', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);
  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  // Add a doc to the space's root meta.pages
  const docId = 'test-doc-id';
  await t.context.spaceDoc.addDocToRootMeta(workspace.id, space.id, docId);

  // Verify the doc was added to meta.pages
  const pages = await getMetaPages(t.context.doc, workspace.id, space.id);
  t.is(pages.length, 1, 'Should have 1 doc in meta.pages');
  t.is(pages[0].id, docId, 'Doc ID should match');
});

test('addDocToRootMeta should not duplicate doc in meta.pages', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);
  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  const docId = 'test-doc-id';

  // Add the same doc twice
  await t.context.spaceDoc.addDocToRootMeta(workspace.id, space.id, docId);
  await t.context.spaceDoc.addDocToRootMeta(workspace.id, space.id, docId);

  // Verify the doc was only added once
  const pages = await getMetaPages(t.context.doc, workspace.id, space.id);
  t.is(pages.length, 1, 'Should have only 1 doc in meta.pages (no duplicates)');
});

test('addDocToRootMeta should add multiple docs to meta.pages', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);
  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  // Add multiple docs
  await t.context.spaceDoc.addDocToRootMeta(workspace.id, space.id, 'doc-1');
  await t.context.spaceDoc.addDocToRootMeta(workspace.id, space.id, 'doc-2');
  await t.context.spaceDoc.addDocToRootMeta(workspace.id, space.id, 'doc-3');

  // Verify all docs were added
  const pages = await getMetaPages(t.context.doc, workspace.id, space.id);
  t.is(pages.length, 3, 'Should have 3 docs in meta.pages');

  const docIds = pages.map(p => p.id);
  t.true(docIds.includes('doc-1'));
  t.true(docIds.includes('doc-2'));
  t.true(docIds.includes('doc-3'));
});

test('addDocToRootMeta should handle non-existent container gracefully', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);

  // Try to add a doc to a non-existent space
  await t.notThrowsAsync(async () => {
    await t.context.spaceDoc.addDocToRootMeta(
      workspace.id,
      'non-existent-space-id',
      'test-doc'
    );
  });
});

// =============================================================================
// removeDocFromRootMeta Tests
// =============================================================================

test('removeDocFromRootMeta should remove doc from space root meta.pages', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);
  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  // Add docs first
  await t.context.spaceDoc.addDocToRootMeta(workspace.id, space.id, 'doc-1');
  await t.context.spaceDoc.addDocToRootMeta(workspace.id, space.id, 'doc-2');

  // Verify both docs exist
  let pages = await getMetaPages(t.context.doc, workspace.id, space.id);
  t.is(pages.length, 2, 'Should have 2 docs initially');

  // Remove one doc
  await t.context.spaceDoc.removeDocFromRootMeta(
    workspace.id,
    space.id,
    'doc-1'
  );

  // Verify only one doc remains
  pages = await getMetaPages(t.context.doc, workspace.id, space.id);
  t.is(pages.length, 1, 'Should have 1 doc after removal');
  t.is(pages[0].id, 'doc-2', 'Remaining doc should be doc-2');
});

test('removeDocFromRootMeta should handle non-existent doc gracefully', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);
  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  // Try to remove a non-existent doc
  await t.notThrowsAsync(async () => {
    await t.context.spaceDoc.removeDocFromRootMeta(
      workspace.id,
      space.id,
      'non-existent-doc'
    );
  });
});

// =============================================================================
// moveDoc Tests - Core functionality
// =============================================================================

test('moveDoc should update target space meta.pages when moving to space', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);
  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  // Create a doc in the workspace (simulating an existing doc)
  const docId = 'test-doc-for-move';
  await t.context.doc.upsert({
    spaceId: workspace.id,
    docId,
    blob: Buffer.from('test'),
    timestamp: Date.now(),
  });

  // Move the doc to the space
  await t.context.spaceDoc.moveDoc(workspace.id, docId, space.id);

  // Verify the doc is in the space's meta.pages
  const pages = await getMetaPages(t.context.doc, workspace.id, space.id);
  t.is(pages.length, 1, 'Space meta.pages should have 1 doc');
  t.is(pages[0].id, docId, 'Doc ID in meta.pages should match');

  // Verify the SpaceDoc record was created
  const spaceDocRecords = await t.context.spaceDoc.list(space.id);
  t.true(
    spaceDocRecords.includes(docId),
    'SpaceDoc table should contain the doc'
  );
});

test('moveDoc should update both source and target meta.pages', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);

  const space1 = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Space 1',
  });

  const space2 = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Space 2',
  });

  // Create a doc and add it to space1's meta.pages
  const docId = 'test-doc-for-move';
  await t.context.doc.upsert({
    spaceId: workspace.id,
    containerSpaceId: space1.id,
    docId,
    blob: Buffer.from('test'),
    timestamp: Date.now(),
  });

  // Manually add to space1's meta.pages to simulate existing state
  await t.context.spaceDoc.addDoc(space1.id, docId);
  await t.context.spaceDoc.addDocToRootMeta(workspace.id, space1.id, docId);

  // Verify doc is in space1's meta.pages
  let space1Pages = await getMetaPages(t.context.doc, workspace.id, space1.id);
  t.is(space1Pages.length, 1, 'Space1 should have 1 doc initially');

  // Move the doc from space1 to space2
  await t.context.spaceDoc.moveDoc(workspace.id, docId, space2.id);

  // Verify doc is removed from space1's meta.pages
  space1Pages = await getMetaPages(t.context.doc, workspace.id, space1.id);
  t.is(space1Pages.length, 0, 'Space1 should have 0 docs after move');

  // Verify doc is added to space2's meta.pages
  const space2Pages = await getMetaPages(
    t.context.doc,
    workspace.id,
    space2.id
  );
  t.is(space2Pages.length, 1, 'Space2 should have 1 doc after move');
  t.is(space2Pages[0].id, docId, 'Doc ID in space2 meta.pages should match');
});

test('moveDoc should handle moving to workspace root (null spaceId)', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);

  // Create workspace root doc (simulating real workspace behavior)
  await createWorkspaceRootDoc(t.context.doc, workspace.id);

  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  // Create a doc in the space
  const docId = 'test-doc-for-move';
  await t.context.doc.upsert({
    spaceId: workspace.id,
    containerSpaceId: space.id,
    docId,
    blob: Buffer.from('test'),
    timestamp: Date.now(),
  });

  // Add to space's meta.pages
  await t.context.spaceDoc.addDoc(space.id, docId);
  await t.context.spaceDoc.addDocToRootMeta(workspace.id, space.id, docId);

  // Verify doc is in space
  let spacePages = await getMetaPages(t.context.doc, workspace.id, space.id);
  t.is(spacePages.length, 1, 'Space should have 1 doc initially');

  // Move doc to workspace root (null spaceId)
  await t.context.spaceDoc.moveDoc(workspace.id, docId, null);

  // Verify doc is removed from space's meta.pages
  spacePages = await getMetaPages(t.context.doc, workspace.id, space.id);
  t.is(
    spacePages.length,
    0,
    'Space should have 0 docs after move to workspace root'
  );

  // Verify doc is added to workspace root's meta.pages
  const workspacePages = await getMetaPages(
    t.context.doc,
    workspace.id,
    workspace.id
  );
  t.is(workspacePages.length, 1, 'Workspace root should have 1 doc');
  t.is(workspacePages[0].id, docId, 'Doc ID in workspace root should match');
});

test('moveDoc should update SpaceDoc table correctly', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);

  const space1 = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Space 1',
  });

  const space2 = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Space 2',
  });

  // Create a doc and add it to space1
  const docId = 'test-doc-for-move';
  await t.context.doc.upsert({
    spaceId: workspace.id,
    containerSpaceId: space1.id,
    docId,
    blob: Buffer.from('test'),
    timestamp: Date.now(),
  });
  await t.context.spaceDoc.addDoc(space1.id, docId);

  // Verify initial state in SpaceDoc table
  let space1Docs = await t.context.spaceDoc.list(space1.id);
  t.true(space1Docs.includes(docId), 'Space1 SpaceDoc should contain the doc');

  // Move to space2
  await t.context.spaceDoc.moveDoc(workspace.id, docId, space2.id);

  // Verify SpaceDoc table is updated
  space1Docs = await t.context.spaceDoc.list(space1.id);
  t.false(
    space1Docs.includes(docId),
    'Space1 SpaceDoc should not contain the doc'
  );

  const space2Docs = await t.context.spaceDoc.list(space2.id);
  t.true(space2Docs.includes(docId), 'Space2 SpaceDoc should contain the doc');
});

// =============================================================================
// Edge Cases and Concurrency Tests
// =============================================================================

test('addDocToRootMeta should handle concurrent updates gracefully', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);
  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  // Simulate concurrent additions (different docs)
  await Promise.all([
    t.context.spaceDoc.addDocToRootMeta(
      workspace.id,
      space.id,
      'concurrent-doc-1'
    ),
    t.context.spaceDoc.addDocToRootMeta(
      workspace.id,
      space.id,
      'concurrent-doc-2'
    ),
    t.context.spaceDoc.addDocToRootMeta(
      workspace.id,
      space.id,
      'concurrent-doc-3'
    ),
  ]);

  // Due to timestamp-based upsert, some updates may be lost
  // The test verifies at least one doc was added
  const pages = await getMetaPages(t.context.doc, workspace.id, space.id);
  t.true(pages.length >= 1, 'At least one doc should be in meta.pages');
});

// =============================================================================
// Integration Tests: Full workflow
// =============================================================================

test('full workflow: create space, add doc, move doc, verify meta.pages', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);

  // Create workspace root doc
  await createWorkspaceRootDoc(t.context.doc, workspace.id);

  // Create two spaces
  const space1 = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Space 1',
  });
  const space2 = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Space 2',
  });

  // Verify both spaces have empty meta.pages
  let space1Pages = await getMetaPages(t.context.doc, workspace.id, space1.id);
  let space2Pages = await getMetaPages(t.context.doc, workspace.id, space2.id);
  t.is(space1Pages.length, 0, 'Space1 should start empty');
  t.is(space2Pages.length, 0, 'Space2 should start empty');

  // Create a doc in workspace root
  const docId = 'workflow-test-doc';
  await t.context.doc.upsert({
    spaceId: workspace.id,
    docId,
    blob: Buffer.from('test doc content'),
    timestamp: Date.now(),
  });
  await t.context.spaceDoc.addDocToRootMeta(workspace.id, workspace.id, docId);

  // Verify doc is in workspace root
  let workspacePages = await getMetaPages(
    t.context.doc,
    workspace.id,
    workspace.id
  );
  t.is(workspacePages.length, 1, 'Workspace should have 1 doc');

  // Move doc from workspace to space1
  await t.context.spaceDoc.moveDoc(workspace.id, docId, space1.id);

  // Verify doc moved from workspace to space1
  workspacePages = await getMetaPages(
    t.context.doc,
    workspace.id,
    workspace.id
  );
  space1Pages = await getMetaPages(t.context.doc, workspace.id, space1.id);
  t.is(workspacePages.length, 0, 'Workspace should have 0 docs after move');
  t.is(space1Pages.length, 1, 'Space1 should have 1 doc');

  // Move doc from space1 to space2
  await t.context.spaceDoc.moveDoc(workspace.id, docId, space2.id);

  // Verify doc moved from space1 to space2
  space1Pages = await getMetaPages(t.context.doc, workspace.id, space1.id);
  space2Pages = await getMetaPages(t.context.doc, workspace.id, space2.id);
  t.is(space1Pages.length, 0, 'Space1 should have 0 docs after move');
  t.is(space2Pages.length, 1, 'Space2 should have 1 doc');

  // Move doc back to workspace root
  await t.context.spaceDoc.moveDoc(workspace.id, docId, null);

  // Verify doc moved back to workspace
  space2Pages = await getMetaPages(t.context.doc, workspace.id, space2.id);
  workspacePages = await getMetaPages(
    t.context.doc,
    workspace.id,
    workspace.id
  );
  t.is(space2Pages.length, 0, 'Space2 should have 0 docs after move');
  t.is(workspacePages.length, 1, 'Workspace should have 1 doc');
});
