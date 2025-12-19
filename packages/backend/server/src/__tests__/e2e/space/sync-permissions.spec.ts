import { DocRole } from '../../../models';
import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

/**
 * Space Sync Permission Tests
 *
 * These tests verify that the Space permission model correctly enforces
 * access control for document editing via the sync gateway.
 *
 * Permission model:
 * - Reader/Commenter: Can read but NOT sync/edit (no Space.Sync permission)
 * - Editor/Manager/Owner: Can sync and edit documents
 */

// =============================================================================
// Permission Model Tests
// =============================================================================

e2e('Reader role should NOT have Space.Sync permission', async t => {
  const owner = await app.signup();
  const reader = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  // Add reader to workspace
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: reader.id,
  });

  // Create space with defaultRole: Reader
  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    defaultRole: DocRole.Reader,
  });

  // Check that reader does NOT have Space.Sync permission
  const ac = app.get(
    (await import('../../../core/permission')).AccessController
  );
  const canSync = await ac
    .user(reader.id)
    .space(workspace.id, space.id)
    .can('Space.Sync');

  t.false(canSync, 'Reader should NOT have Space.Sync permission');
});

e2e('Commenter role should NOT have Space.Sync permission', async t => {
  const owner = await app.signup();
  const commenter = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  // Add commenter to workspace
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: commenter.id,
  });

  // Create space with defaultRole: Commenter
  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    defaultRole: DocRole.Commenter,
  });

  // Check that commenter does NOT have Space.Sync permission
  const ac = app.get(
    (await import('../../../core/permission')).AccessController
  );
  const canSync = await ac
    .user(commenter.id)
    .space(workspace.id, space.id)
    .can('Space.Sync');

  t.false(canSync, 'Commenter should NOT have Space.Sync permission');
});

e2e('Editor role should have Space.Sync permission', async t => {
  const owner = await app.signup();
  const editor = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  // Add editor to workspace
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: editor.id,
  });

  // Create space with defaultRole: Editor
  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    defaultRole: DocRole.Editor,
  });

  // Check that editor DOES have Space.Sync permission
  const ac = app.get(
    (await import('../../../core/permission')).AccessController
  );
  const canSync = await ac
    .user(editor.id)
    .space(workspace.id, space.id)
    .can('Space.Sync');

  t.true(canSync, 'Editor should have Space.Sync permission');
});

e2e('Explicit Reader role should override default Editor role', async t => {
  const owner = await app.signup();
  const member = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  // Add member to workspace
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
  });

  // Create space with defaultRole: Editor
  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    defaultRole: DocRole.Editor,
  });

  // Grant explicit Reader role to member (should override default Editor)
  await app.create(Mockers.SpaceUser, {
    space: { id: space.id },
    user: { id: member.id },
    role: DocRole.Reader,
  });

  // Check that member does NOT have Space.Sync permission (explicit Reader overrides)
  const ac = app.get(
    (await import('../../../core/permission')).AccessController
  );
  const canSync = await ac
    .user(member.id)
    .space(workspace.id, space.id)
    .can('Space.Sync');

  t.false(
    canSync,
    'Explicit Reader role should NOT have Space.Sync permission'
  );
});

e2e(
  'Workspace owner should always have Space.Sync permission regardless of space defaultRole',
  async t => {
    const owner = await app.signup();

    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });

    // Create space with defaultRole: None (no access for regular members)
    const space = await app.create(Mockers.Space, {
      workspace: { id: workspace.id },
      owner: { id: owner.id },
      defaultRole: DocRole.None,
    });

    // Check that workspace owner DOES have Space.Sync permission
    const ac = app.get(
      (await import('../../../core/permission')).AccessController
    );
    const canSync = await ac
      .user(owner.id)
      .space(workspace.id, space.id)
      .can('Space.Sync');

    t.true(canSync, 'Workspace owner should always have Space.Sync permission');
  }
);

// =============================================================================
// Space.Sync Assertion Tests
// =============================================================================

e2e('Space.Sync assertion should throw for Reader role', async t => {
  const owner = await app.signup();
  const reader = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: reader.id,
  });

  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    defaultRole: DocRole.Reader,
  });

  const ac = app.get(
    (await import('../../../core/permission')).AccessController
  );

  await t.throwsAsync(
    async () => {
      await ac
        .user(reader.id)
        .space(workspace.id, space.id)
        .assert('Space.Sync');
    },
    { message: /access denied|permission/i },
    'Reader should be denied Space.Sync'
  );
});

e2e('Space.Sync assertion should NOT throw for Editor role', async t => {
  const owner = await app.signup();
  const editor = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: editor.id,
  });

  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    defaultRole: DocRole.Editor,
  });

  const ac = app.get(
    (await import('../../../core/permission')).AccessController
  );

  // Should not throw
  await t.notThrowsAsync(async () => {
    await ac.user(editor.id).space(workspace.id, space.id).assert('Space.Sync');
  }, 'Editor should be allowed Space.Sync');
});

// =============================================================================
// Doc.Update Permission Tests (for docs in spaces)
// =============================================================================

e2e(
  'Reader should NOT have Doc.Update permission for doc in space',
  async t => {
    const owner = await app.signup();
    const reader = await app.signup();

    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });

    await app.create(Mockers.WorkspaceUser, {
      workspaceId: workspace.id,
      userId: reader.id,
    });

    const space = await app.create(Mockers.Space, {
      workspace: { id: workspace.id },
      owner: { id: owner.id },
      defaultRole: DocRole.Reader,
    });

    // Add a doc to the space
    const docId = 'test-doc-for-reader';
    await app.create(Mockers.SpaceDoc, {
      space: { id: space.id },
      docId,
    });

    const ac = app.get(
      (await import('../../../core/permission')).AccessController
    );
    const canUpdate = await ac
      .user(reader.id)
      .doc(workspace.id, docId)
      .can('Doc.Update');

    t.false(canUpdate, 'Reader should NOT have Doc.Update permission');
  }
);

e2e('Editor should have Doc.Update permission for doc in space', async t => {
  const owner = await app.signup();
  const editor = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: editor.id,
  });

  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    defaultRole: DocRole.Editor,
  });

  // Add a doc to the space
  const docId = 'test-doc-for-editor';
  await app.create(Mockers.SpaceDoc, {
    space: { id: space.id },
    docId,
  });

  const ac = app.get(
    (await import('../../../core/permission')).AccessController
  );
  const canUpdate = await ac
    .user(editor.id)
    .doc(workspace.id, docId)
    .can('Doc.Update');

  t.true(canUpdate, 'Editor should have Doc.Update permission');
});

// =============================================================================
// SpaceDoc Model Tests
// =============================================================================

e2e('getSpaceForDoc should return space info for doc in space', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
  });

  const docId = 'test-doc-in-space';
  await app.create(Mockers.SpaceDoc, {
    space: { id: space.id },
    docId,
  });

  const spaceDoc = await app.models.spaceDoc.getSpaceForDoc(docId);

  t.truthy(spaceDoc, 'Should return space doc info');
  t.is(spaceDoc?.spaceId, space.id, 'Should return correct space ID');
  t.is(spaceDoc?.docId, docId, 'Should return correct doc ID');
});

e2e('getSpaceForDoc should return null for doc not in any space', async t => {
  const owner = await app.signup();

  await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const spaceDoc = await app.models.spaceDoc.getSpaceForDoc('non-existent-doc');

  t.is(spaceDoc, null, 'Should return null for doc not in space');
});
