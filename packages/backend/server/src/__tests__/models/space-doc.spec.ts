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
  const pages = meta.get('pages') as YArray<YMap<unknown>> | undefined;

  if (!pages) {
    return [];
  }

  const result: DocMeta[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages.get(i);
    // Handle both YMap items (from addDocToRootMeta) and plain objects
    if (page instanceof YMap) {
      result.push({
        id: page.get('id') as string,
        title: page.get('title') as string | undefined,
        createDate: page.get('createDate') as number | undefined,
        tags: page.get('tags') as string[] | undefined,
      });
    } else {
      // Fallback for plain objects
      result.push(page as unknown as DocMeta);
    }
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
// SpaceDoc Table Tests - The new single source of truth
// =============================================================================

test('addDoc should add doc to SpaceDoc table', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);
  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  // Add a doc to the space
  const docId = 'test-doc-id';
  await t.context.spaceDoc.addDoc(space.id, docId);

  // Verify the doc was added to SpaceDoc table
  const docIds = await t.context.spaceDoc.list(space.id);
  t.true(docIds.includes(docId), 'SpaceDoc table should contain the doc');
});

test('addDoc should not duplicate doc in SpaceDoc table', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);
  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  const docId = 'test-doc-id';

  // Add the same doc twice
  await t.context.spaceDoc.addDoc(space.id, docId);
  await t.context.spaceDoc.addDoc(space.id, docId);

  // Verify the doc was only added once
  const docIds = await t.context.spaceDoc.list(space.id);
  const count = docIds.filter(id => id === docId).length;
  t.is(count, 1, 'Should have only 1 doc in SpaceDoc table (no duplicates)');
});

test('addDoc should add multiple docs to SpaceDoc table', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);
  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  // Add multiple docs
  await t.context.spaceDoc.addDoc(space.id, 'doc-1');
  await t.context.spaceDoc.addDoc(space.id, 'doc-2');
  await t.context.spaceDoc.addDoc(space.id, 'doc-3');

  // Verify all docs were added
  const docIds = await t.context.spaceDoc.list(space.id);
  t.is(docIds.length, 3, 'Should have 3 docs in SpaceDoc table');
  t.true(docIds.includes('doc-1'));
  t.true(docIds.includes('doc-2'));
  t.true(docIds.includes('doc-3'));
});

test('removeDoc should remove doc from SpaceDoc table', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);
  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  // Add docs first
  await t.context.spaceDoc.addDoc(space.id, 'doc-1');
  await t.context.spaceDoc.addDoc(space.id, 'doc-2');

  // Verify both docs exist
  let docIds = await t.context.spaceDoc.list(space.id);
  t.is(docIds.length, 2, 'Should have 2 docs initially');

  // Remove one doc
  await t.context.spaceDoc.removeDoc(space.id, 'doc-1');

  // Verify only one doc remains
  docIds = await t.context.spaceDoc.list(space.id);
  t.is(docIds.length, 1, 'Should have 1 doc after removal');
  t.true(docIds.includes('doc-2'), 'Remaining doc should be doc-2');
});

test('removeDoc should handle non-existent doc gracefully', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);
  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  // Try to remove a non-existent doc
  await t.notThrowsAsync(async () => {
    await t.context.spaceDoc.removeDoc(space.id, 'non-existent-doc');
  });
});

// =============================================================================
// addDocToRootMeta Tests - Now only updates workspace.meta.pages
// =============================================================================

test('addDocToRootMeta should skip space.meta.pages updates', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);
  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  // Add a doc to the space's root meta.pages (should be skipped)
  const docId = 'test-doc-id';
  await t.context.spaceDoc.addDocToRootMeta(workspace.id, space.id, docId);

  // Verify the doc was NOT added to space.meta.pages (it skips space updates now)
  const pages = await getMetaPages(t.context.doc, workspace.id, space.id);
  t.is(
    pages.length,
    0,
    'Space meta.pages should remain empty (space updates are skipped)'
  );
});

test('addDocToRootMeta should update workspace.meta.pages', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);

  // Create workspace root doc first
  await createWorkspaceRootDoc(t.context.doc, workspace.id);

  // Add a doc to workspace.meta.pages
  const docId = 'test-doc-id';
  await t.context.spaceDoc.addDocToRootMeta(workspace.id, workspace.id, docId);

  // Verify the doc was added to workspace.meta.pages
  const pages = await getMetaPages(t.context.doc, workspace.id, workspace.id);
  t.is(pages.length, 1, 'Workspace meta.pages should have 1 doc');
  t.is(pages[0].id, docId, 'Doc ID should match');
});

test('addDocToRootMeta should handle non-existent container gracefully', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);

  // Try to add a doc to a non-existent space (should not throw)
  await t.notThrowsAsync(async () => {
    await t.context.spaceDoc.addDocToRootMeta(
      workspace.id,
      'non-existent-space-id',
      'test-doc'
    );
  });
});

// =============================================================================
// removeDocFromRootMeta Tests - Now only updates workspace.meta.pages
// =============================================================================

test('removeDocFromRootMeta should skip space.meta.pages updates', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);
  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  // Try to remove a doc from space's meta.pages (should be skipped)
  await t.notThrowsAsync(async () => {
    await t.context.spaceDoc.removeDocFromRootMeta(
      workspace.id,
      space.id,
      'test-doc'
    );
  });
});

// =============================================================================
// moveDoc Tests - Core functionality (uses SpaceDoc table)
// =============================================================================

test('moveDoc should update SpaceDoc table when moving to space', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);
  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  // Create workspace root doc
  await createWorkspaceRootDoc(t.context.doc, workspace.id);

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

  // Verify the SpaceDoc record was created
  const spaceDocRecords = await t.context.spaceDoc.list(space.id);
  t.true(
    spaceDocRecords.includes(docId),
    'SpaceDoc table should contain the doc'
  );

  // Verify space.meta.pages was NOT updated (we skip space meta.pages now)
  const spacePages = await getMetaPages(t.context.doc, workspace.id, space.id);
  t.is(spacePages.length, 0, 'Space meta.pages should remain empty');
});

test('moveDoc should update SpaceDoc table when moving between spaces', async t => {
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
    docId,
    blob: Buffer.from('test'),
    timestamp: Date.now(),
  });

  // Add to space1 via SpaceDoc table
  await t.context.spaceDoc.addDoc(space1.id, docId);

  // Verify doc is in space1
  let space1Docs = await t.context.spaceDoc.list(space1.id);
  t.true(space1Docs.includes(docId), 'Space1 SpaceDoc should contain the doc');

  // Move the doc from space1 to space2
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

test('moveDoc should remove from SpaceDoc table when moving to workspace root', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);

  // Create workspace root doc
  await createWorkspaceRootDoc(t.context.doc, workspace.id);

  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  // Create a doc in the space
  const docId = 'test-doc-for-move';
  await t.context.doc.upsert({
    spaceId: workspace.id,
    docId,
    blob: Buffer.from('test'),
    timestamp: Date.now(),
  });

  // Add to space via SpaceDoc table
  await t.context.spaceDoc.addDoc(space.id, docId);

  // Verify doc is in space
  let spaceDocs = await t.context.spaceDoc.list(space.id);
  t.true(spaceDocs.includes(docId), 'Space SpaceDoc should contain the doc');

  // Move doc to workspace root (null spaceId)
  await t.context.spaceDoc.moveDoc(workspace.id, docId, null);

  // Verify doc is removed from SpaceDoc table
  spaceDocs = await t.context.spaceDoc.list(space.id);
  t.false(
    spaceDocs.includes(docId),
    'Space SpaceDoc should not contain the doc after move'
  );

  // Verify doc is added to workspace.meta.pages
  const workspacePages = await getMetaPages(
    t.context.doc,
    workspace.id,
    workspace.id
  );
  t.is(workspacePages.length, 1, 'Workspace root should have 1 doc');
  t.is(workspacePages[0].id, docId, 'Doc ID in workspace root should match');
});

// =============================================================================
// getSpaceId and getSpaceForDoc Tests
// =============================================================================

test('getSpaceId should return space ID for doc in space', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);
  const space = await t.context.space.create(user.id, {
    workspaceId: workspace.id,
    name: 'Test Space',
  });

  const docId = 'test-doc';
  await t.context.spaceDoc.addDoc(space.id, docId);

  const spaceId = await t.context.spaceDoc.getSpaceId(docId);
  t.is(spaceId, space.id, 'getSpaceId should return the correct space ID');
});

test('getSpaceId should return null for doc in workspace root', async t => {
  const user = await t.context.user.create({ email: 'test@affine.pro' });
  const workspace = await t.context.workspace.create(user.id);

  // Create a doc that's not in any space
  const docId = 'workspace-doc';
  await t.context.doc.upsert({
    spaceId: workspace.id,
    docId,
    blob: Buffer.from('test'),
    timestamp: Date.now(),
  });

  const spaceId = await t.context.spaceDoc.getSpaceId(docId);
  t.is(
    spaceId,
    null,
    'getSpaceId should return null for docs in workspace root'
  );
});

test('getSpaceIdsForDocs should return map of docId to spaceId', async t => {
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

  await t.context.spaceDoc.addDoc(space1.id, 'doc-1');
  await t.context.spaceDoc.addDoc(space2.id, 'doc-2');
  // doc-3 is in workspace root (not in any space)

  const spaceIds = await t.context.spaceDoc.getSpaceIdsForDocs([
    'doc-1',
    'doc-2',
    'doc-3',
  ]);

  t.is(spaceIds.get('doc-1'), space1.id);
  t.is(spaceIds.get('doc-2'), space2.id);
  t.is(spaceIds.get('doc-3'), null);
});

// =============================================================================
// Integration Tests: Full workflow using SpaceDoc table
// =============================================================================

test('full workflow: create space, add doc, move doc via SpaceDoc table', async t => {
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

  // Verify both spaces have empty SpaceDoc records
  let space1Docs = await t.context.spaceDoc.list(space1.id);
  let space2Docs = await t.context.spaceDoc.list(space2.id);
  t.is(space1Docs.length, 0, 'Space1 should start empty');
  t.is(space2Docs.length, 0, 'Space2 should start empty');

  // Create a doc in workspace
  const docId = 'workflow-test-doc';
  await t.context.doc.upsert({
    spaceId: workspace.id,
    docId,
    blob: Buffer.from('test doc content'),
    timestamp: Date.now(),
  });
  await t.context.spaceDoc.addDocToRootMeta(workspace.id, workspace.id, docId);

  // Verify doc is in workspace root meta.pages
  let workspacePages = await getMetaPages(
    t.context.doc,
    workspace.id,
    workspace.id
  );
  t.is(workspacePages.length, 1, 'Workspace should have 1 doc');

  // Move doc from workspace to space1
  await t.context.spaceDoc.moveDoc(workspace.id, docId, space1.id);

  // Verify doc is now in space1's SpaceDoc table
  space1Docs = await t.context.spaceDoc.list(space1.id);
  t.is(space1Docs.length, 1, 'Space1 SpaceDoc should have 1 doc');
  t.true(space1Docs.includes(docId));

  // Doc should still be in workspace.meta.pages (for blockCollections)
  workspacePages = await getMetaPages(
    t.context.doc,
    workspace.id,
    workspace.id
  );
  t.is(
    workspacePages.length,
    1,
    'Workspace meta.pages should still have 1 doc'
  );

  // Move doc from space1 to space2
  await t.context.spaceDoc.moveDoc(workspace.id, docId, space2.id);

  // Verify SpaceDoc table updated correctly
  space1Docs = await t.context.spaceDoc.list(space1.id);
  space2Docs = await t.context.spaceDoc.list(space2.id);
  t.is(space1Docs.length, 0, 'Space1 SpaceDoc should have 0 docs after move');
  t.is(space2Docs.length, 1, 'Space2 SpaceDoc should have 1 doc');

  // Move doc back to workspace root
  await t.context.spaceDoc.moveDoc(workspace.id, docId, null);

  // Verify SpaceDoc table is empty for space2
  space2Docs = await t.context.spaceDoc.list(space2.id);
  t.is(space2Docs.length, 0, 'Space2 SpaceDoc should have 0 docs after move');

  // Verify doc is still in workspace.meta.pages
  workspacePages = await getMetaPages(
    t.context.doc,
    workspace.id,
    workspace.id
  );
  t.is(workspacePages.length, 1, 'Workspace meta.pages should have 1 doc');
});
