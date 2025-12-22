import { PrismaClient } from '@prisma/client';
import test from 'ava';
import { Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import { DocStorageModule } from '../../core/doc';
import { PermissionModule } from '../../core/permission';
import { StorageModule } from '../../core/storage';
import { DocMoveService } from '../../core/workspaces/doc-move';
import { createTestingModule, type TestingModule } from '../utils';

let m: TestingModule;
let db: PrismaClient;
let moveService: DocMoveService;

test.before('init testing module', async () => {
  m = await createTestingModule({
    imports: [DocStorageModule, PermissionModule, StorageModule],
    providers: [DocMoveService],
  });
  db = m.get(PrismaClient);
  moveService = m.get(DocMoveService);
});

test.beforeEach(async () => {
  await m.initTestingDB();
});

test.after.always(async () => {
  await m?.close();
});

async function createDoc(
  workspaceId: string,
  docId: string,
  content = 'test'
): Promise<void> {
  const doc = new YDoc();
  const text = doc.getText('content');
  text.insert(0, content);
  const blob = Buffer.from(encodeStateAsUpdate(doc));

  await db.snapshot.create({
    data: {
      workspaceId,
      id: docId,
      blob,
      updatedAt: new Date(),
    },
  });
}

async function createUser(userId: string): Promise<void> {
  await db.user.create({
    data: {
      id: userId,
      email: `${userId}@test.com`,
      name: userId,
    },
  });
}

async function createWorkspace(
  workspaceId: string,
  ownerId: string
): Promise<void> {
  await db.workspace.create({
    data: {
      id: workspaceId,
      public: false,
    },
  });

  await db.workspaceUserRole.create({
    data: {
      workspaceId,
      userId: ownerId,
      type: 99, // Owner
      accepted: true,
    },
  });
}

test('findDocWorkspace should return correct workspace for existing doc', async t => {
  const docId = 'test-doc-1';
  const workspaceId = 'ws-1';

  await createDoc(workspaceId, docId);

  const result = await moveService.findDocWorkspace(docId);

  t.is(result, workspaceId);
});

test('findDocWorkspace should return null for non-existing doc', async t => {
  const result = await moveService.findDocWorkspace('non-existent-doc');

  t.is(result, null);
});

test('findDocWorkspace should find doc by update record if no snapshot', async t => {
  const docId = 'test-doc-2';
  const workspaceId = 'ws-2';

  // Create update record instead of snapshot
  const doc = new YDoc();
  const text = doc.getText('content');
  text.insert(0, 'test');
  const blob = Buffer.from(encodeStateAsUpdate(doc));

  await db.update.create({
    data: {
      workspaceId,
      id: docId,
      blob,
      createdAt: new Date(),
    },
  });

  const result = await moveService.findDocWorkspace(docId);

  t.is(result, workspaceId);
});

test('collectDocsToMove returns single doc when moveLinkedDocs is false', async t => {
  const workspaceId = 'ws-test';
  const docId = 'doc-to-move';

  await createDoc(workspaceId, docId);

  // Use private method via any cast for testing
  const result = await (moveService as any).collectDocsToMove(
    workspaceId,
    docId,
    false, // includeLinked
    'immediate'
  );

  t.deepEqual(result, [docId]);
});

test('moveToWorkspace validates permissions', async t => {
  const userId = 'user-1';
  const sourceWs = 'source-ws';
  const targetWs = 'target-ws';
  const docId = 'doc-to-move';

  await createUser(userId);
  await createWorkspace(sourceWs, userId);
  await createWorkspace(targetWs, userId);
  await createDoc(sourceWs, docId);

  // Create doc user role
  await db.workspaceDocUserRole.create({
    data: {
      workspaceId: sourceWs,
      docId: docId,
      userId: userId,
      type: 99, // Owner
    },
  });

  // Attempt move
  const result = await moveService.moveToWorkspace(userId, {
    sourceWorkspaceId: sourceWs,
    docId,
    targetWorkspaceId: targetWs,
    moveLinkedDocs: false,
    linkTraversalMode: 'immediate',
  });

  t.true(result.success);
  t.is(result.movedDocs.length, 1);
  t.is(result.movedDocs[0].originalDocId, docId);
  t.is(result.movedDocs[0].newDocId, docId); // ID is preserved
  t.is(result.newWorkspaceId, targetWs);

  // Verify doc is in target workspace
  const targetDoc = await db.snapshot.findUnique({
    where: {
      workspaceId_id: {
        workspaceId: targetWs,
        id: docId,
      },
    },
  });
  t.truthy(targetDoc);

  // Verify doc is removed from source workspace
  const sourceDoc = await db.snapshot.findUnique({
    where: {
      workspaceId_id: {
        workspaceId: sourceWs,
        id: docId,
      },
    },
  });
  t.falsy(sourceDoc);
});
