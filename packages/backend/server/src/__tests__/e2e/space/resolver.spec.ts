import { DocRole } from '../../../models';
import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

// Note: These tests use inline GraphQL queries since the schema hasn't been generated yet.
// Once the schema is generated and graphql codegen runs, these can be replaced with
// imported queries from @affine/graphql

// Helper type to bypass strict typing for ungenerated GraphQL
type GqlQuery = {
  id: string;
  op: string;
  query: string;
};

// Helper to execute raw GraphQL with bypassed types
async function rawGql<T = any>(
  query: GqlQuery,
  variables: Record<string, unknown>
): Promise<T> {
  return (await app.gql({
    query: query as any,
    variables: variables as any,
  })) as T;
}

const createSpaceMutation: GqlQuery = {
  id: 'createSpaceMutation',
  op: 'createSpace',
  query: `mutation createSpace($input: CreateSpaceInput!) {
    createSpace(input: $input) {
      id
      workspaceId
      name
      description
      defaultRole
      createdAt
      updatedAt
    }
  }`,
};

const listWorkspaceSpacesQuery: GqlQuery = {
  id: 'listWorkspaceSpacesQuery',
  op: 'listWorkspaceSpaces',
  query: `query listWorkspaceSpaces($workspaceId: String!) {
    workspace(id: $workspaceId) {
      spaces {
        id
        workspaceId
        name
        description
        defaultRole
        role
        createdAt
        updatedAt
        docCount
      }
    }
  }`,
};

const getSpaceQuery: GqlQuery = {
  id: 'getSpaceQuery',
  op: 'getSpace',
  query: `query getSpace($workspaceId: String!, $spaceId: String!) {
    getSpace(workspaceId: $workspaceId, spaceId: $spaceId) {
      id
      workspaceId
      name
      description
      defaultRole
      role
      createdAt
      updatedAt
      docCount
    }
  }`,
};

const updateSpaceMutation: GqlQuery = {
  id: 'updateSpaceMutation',
  op: 'updateSpace',
  query: `mutation updateSpace($workspaceId: String!, $spaceId: String!, $input: UpdateSpaceInput!) {
    updateSpace(workspaceId: $workspaceId, spaceId: $spaceId, input: $input) {
      id
      workspaceId
      name
      description
      defaultRole
      createdAt
      updatedAt
    }
  }`,
};

const deleteSpaceMutation: GqlQuery = {
  id: 'deleteSpaceMutation',
  op: 'deleteSpace',
  query: `mutation deleteSpace($workspaceId: String!, $spaceId: String!) {
    deleteSpace(workspaceId: $workspaceId, spaceId: $spaceId)
  }`,
};

const grantSpaceUserRoleMutation: GqlQuery = {
  id: 'grantSpaceUserRoleMutation',
  op: 'grantSpaceUserRole',
  query: `mutation grantSpaceUserRole($workspaceId: String!, $input: GrantSpaceUserRoleInput!) {
    grantSpaceUserRole(workspaceId: $workspaceId, input: $input)
  }`,
};

const revokeSpaceUserRoleMutation: GqlQuery = {
  id: 'revokeSpaceUserRoleMutation',
  op: 'revokeSpaceUserRole',
  query: `mutation revokeSpaceUserRole($workspaceId: String!, $input: RevokeSpaceUserRoleInput!) {
    revokeSpaceUserRole(workspaceId: $workspaceId, input: $input)
  }`,
};

e2e('should create a space', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const result = await rawGql(createSpaceMutation, {
    input: {
      workspaceId: workspace.id,
      name: 'Test Space',
      description: 'A test space',
      defaultRole: DocRole.Reader,
    },
  });

  const space = result.createSpace;
  t.truthy(space.id);
  t.is(space.workspaceId, workspace.id);
  t.is(space.name, 'Test Space');
  t.is(space.description, 'A test space');
  t.is(space.defaultRole, DocRole.Reader);
});

e2e('should list spaces in a workspace', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  // Create some spaces
  const space1 = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    name: 'Space 1',
  });

  const space2 = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    name: 'Space 2',
  });

  const result = await rawGql(listWorkspaceSpacesQuery, {
    workspaceId: workspace.id,
  });

  const spaces = result.workspace.spaces;
  t.is(spaces.length, 2);
  t.truthy(spaces.find((s: any) => s.id === space1.id));
  t.truthy(spaces.find((s: any) => s.id === space2.id));
});

e2e('should get a space by ID', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    name: 'Test Space',
    description: 'Test description',
  });

  const result = await rawGql(getSpaceQuery, {
    workspaceId: workspace.id,
    spaceId: space.id,
  });

  const fetchedSpace = result.getSpace;
  t.is(fetchedSpace.id, space.id);
  t.is(fetchedSpace.name, 'Test Space');
  t.is(fetchedSpace.description, 'Test description');
  t.is(fetchedSpace.role, DocRole.Owner);
});

e2e('should update a space', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    name: 'Original Name',
  });

  const result = await rawGql(updateSpaceMutation, {
    workspaceId: workspace.id,
    spaceId: space.id,
    input: {
      name: 'Updated Name',
      description: 'Updated description',
    },
  });

  const updatedSpace = result.updateSpace;
  t.is(updatedSpace.id, space.id);
  t.is(updatedSpace.name, 'Updated Name');
  t.is(updatedSpace.description, 'Updated description');
});

e2e('should delete a space', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
  });

  const deleteResult = await rawGql(deleteSpaceMutation, {
    workspaceId: workspace.id,
    spaceId: space.id,
  });

  t.is(deleteResult.deleteSpace, true);

  // Verify space is deleted
  const listResult = await rawGql(listWorkspaceSpacesQuery, {
    workspaceId: workspace.id,
  });

  const spaces = listResult.workspace.spaces;
  t.is(spaces.length, 0);
});

e2e('should grant user role in a space', async t => {
  const owner = await app.signup();
  const member = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  // Add member to workspace first
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
  });

  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    defaultRole: DocRole.External, // No default access
  });

  // Grant editor role to member
  const result = await rawGql(grantSpaceUserRoleMutation, {
    workspaceId: workspace.id,
    input: {
      spaceId: space.id,
      userId: member.id,
      role: DocRole.Editor,
    },
  });

  t.is(result.grantSpaceUserRole, true);
});

e2e('should revoke user role from a space', async t => {
  const owner = await app.signup();
  const member = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  // Add member to workspace first
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
  });

  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
  });

  // Grant editor role to member
  await app.create(Mockers.SpaceUser, {
    space: { id: space.id },
    user: { id: member.id },
    role: DocRole.Editor,
  });

  // Revoke the role
  const result = await rawGql(revokeSpaceUserRoleMutation, {
    workspaceId: workspace.id,
    input: {
      spaceId: space.id,
      userId: member.id,
    },
  });

  t.is(result.revokeSpaceUserRole, true);
});

e2e('workspace owner should have owner access to all spaces', async t => {
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

  // Member creates a space
  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: member.id },
  });

  // Owner should be able to access the space
  const result = await rawGql(getSpaceQuery, {
    workspaceId: workspace.id,
    spaceId: space.id,
  });

  const fetchedSpace = result.getSpace;
  t.is(fetchedSpace.id, space.id);
  // Workspace owner gets Owner role in all spaces
  t.is(fetchedSpace.role, DocRole.Owner);
});

e2e('non-member should not access space with no default role', async t => {
  const owner = await app.signup();
  const nonMember = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  // Create a space that non-member should not have access to
  await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    defaultRole: DocRole.External, // No default access
  });

  // Non-member should not be able to list spaces (no workspace access)
  // First, let's add them to the workspace but not the space
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: nonMember.id,
  });

  // Login as non-member
  await app.login(nonMember);

  // They should see an empty list since they don't have space access
  const result = await rawGql(listWorkspaceSpacesQuery, {
    workspaceId: workspace.id,
  });

  const spaces = result.workspace.spaces;
  t.is(spaces.length, 0);
});

e2e('member with default role should access space', async t => {
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

  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    defaultRole: DocRole.Reader, // Default reader access for workspace members
  });

  // Login as member
  await app.login(member);

  // Member should see the space
  const result = await rawGql(listWorkspaceSpacesQuery, {
    workspaceId: workspace.id,
  });

  const spaces = result.workspace.spaces;
  t.is(spaces.length, 1);
  t.is(spaces[0].id, space.id);
  t.is(spaces[0].role, DocRole.Reader);
});

// =============================================================================
// Security Tests: Space Permission Enforcement for docIds and docCount
// =============================================================================

const getSpaceWithDocIdsQuery: GqlQuery = {
  id: 'getSpaceWithDocIdsQuery',
  op: 'getSpace',
  query: `query getSpace($workspaceId: String!, $spaceId: String!) {
    getSpace(workspaceId: $workspaceId, spaceId: $spaceId) {
      id
      docIds
      docCount
    }
  }`,
};

e2e('should NOT expose docIds for space where user has no access', async t => {
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

  // Create space with defaultRole: None (no access for workspace members)
  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    defaultRole: DocRole.None,
  });

  // Add a doc to the space
  await app.create(Mockers.SpaceDoc, {
    space: { id: space.id },
    docId: 'secret-doc-id',
  });

  // Login as member (who has no space access)
  await app.login(member);

  // Should get error when trying to access the space
  await t.throwsAsync(
    async () => {
      await rawGql(getSpaceWithDocIdsQuery, {
        workspaceId: workspace.id,
        spaceId: space.id,
      });
    },
    { message: /Space not found|Access denied|permission/i }
  );
});

e2e('should expose docIds for space where user has Reader role', async t => {
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

  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    defaultRole: DocRole.Reader, // Members get Reader access
  });

  // Add a doc to the space
  await app.create(Mockers.SpaceDoc, {
    space: { id: space.id },
    docId: 'visible-doc-id',
  });

  // Login as member
  await app.login(member);

  const result = await rawGql(getSpaceWithDocIdsQuery, {
    workspaceId: workspace.id,
    spaceId: space.id,
  });

  t.deepEqual(result.getSpace.docIds, ['visible-doc-id']);
  t.is(result.getSpace.docCount, 1);
});

e2e('should expose docIds for space owner', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  // Create space with defaultRole: None but owner should still see
  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    defaultRole: DocRole.None,
  });

  // Add docs to the space
  await app.create(Mockers.SpaceDoc, {
    space: { id: space.id },
    docId: 'doc-1',
  });
  await app.create(Mockers.SpaceDoc, {
    space: { id: space.id },
    docId: 'doc-2',
  });

  const result = await rawGql(getSpaceWithDocIdsQuery, {
    workspaceId: workspace.id,
    spaceId: space.id,
  });

  t.is(result.getSpace.docIds.length, 2);
  t.true(result.getSpace.docIds.includes('doc-1'));
  t.true(result.getSpace.docIds.includes('doc-2'));
  t.is(result.getSpace.docCount, 2);
});

e2e('workspace owner should see docIds in any space', async t => {
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

  // Member creates a space with no default access
  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: member.id },
    defaultRole: DocRole.None,
  });

  // Add a doc to the space
  await app.create(Mockers.SpaceDoc, {
    space: { id: space.id },
    docId: 'member-doc',
  });

  // Workspace owner should still be able to see docIds
  const result = await rawGql(getSpaceWithDocIdsQuery, {
    workspaceId: workspace.id,
    spaceId: space.id,
  });

  t.deepEqual(result.getSpace.docIds, ['member-doc']);
  t.is(result.getSpace.docCount, 1);
});

// =============================================================================
// Move Doc to Space Tests: meta.pages and SpaceDoc table updates
// =============================================================================

const moveDocToSpaceMutation: GqlQuery = {
  id: 'moveDocToSpaceMutation',
  op: 'moveDocToSpace',
  query: `mutation moveDocToSpace($input: MoveDocToSpaceInput!) {
    moveDocToSpace(input: $input)
  }`,
};

e2e('moveDocToSpace should update space docIds', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    defaultRole: DocRole.Editor,
  });

  // Create a doc in the workspace
  const docId = 'test-doc-for-move';
  await app.create(Mockers.DocSnapshot, {
    user: { id: owner.id },
    workspaceId: workspace.id,
    docId,
  });

  // Verify space initially has 0 docs
  let result = await rawGql(getSpaceWithDocIdsQuery, {
    workspaceId: workspace.id,
    spaceId: space.id,
  });
  t.is(result.getSpace.docCount, 0, 'Space should have 0 docs initially');
  t.deepEqual(
    result.getSpace.docIds,
    [],
    'Space docIds should be empty initially'
  );

  // Move doc to space
  await rawGql(moveDocToSpaceMutation, {
    input: {
      workspaceId: workspace.id,
      docId,
      spaceId: space.id,
    },
  });

  // Verify doc is now in space
  result = await rawGql(getSpaceWithDocIdsQuery, {
    workspaceId: workspace.id,
    spaceId: space.id,
  });
  t.is(result.getSpace.docCount, 1, 'Space should have 1 doc after move');
  t.deepEqual(
    result.getSpace.docIds,
    [docId],
    'Space docIds should contain moved doc'
  );
});

e2e(
  'moveDocToSpace should update docIds when moving between spaces',
  async t => {
    const owner = await app.signup();

    const workspace = await app.create(Mockers.Workspace, {
      owner: { id: owner.id },
    });

    const space1 = await app.create(Mockers.Space, {
      workspace: { id: workspace.id },
      owner: { id: owner.id },
      name: 'Space 1',
      defaultRole: DocRole.Editor,
    });

    const space2 = await app.create(Mockers.Space, {
      workspace: { id: workspace.id },
      owner: { id: owner.id },
      name: 'Space 2',
      defaultRole: DocRole.Editor,
    });

    // Create a doc and add it to space1
    const docId = 'test-doc-for-move';
    await app.create(Mockers.DocSnapshot, {
      user: { id: owner.id },
      workspaceId: workspace.id,
      docId,
    });
    await app.create(Mockers.SpaceDoc, {
      space: { id: space1.id },
      docId,
    });

    // Verify space1 has the doc
    let result = await rawGql(getSpaceWithDocIdsQuery, {
      workspaceId: workspace.id,
      spaceId: space1.id,
    });
    t.is(result.getSpace.docCount, 1, 'Space1 should have 1 doc');
    t.deepEqual(
      result.getSpace.docIds,
      [docId],
      'Space1 docIds should contain the doc'
    );

    // Verify space2 has no docs
    result = await rawGql(getSpaceWithDocIdsQuery, {
      workspaceId: workspace.id,
      spaceId: space2.id,
    });
    t.is(result.getSpace.docCount, 0, 'Space2 should have 0 docs initially');

    // Move doc from space1 to space2
    await rawGql(moveDocToSpaceMutation, {
      input: {
        workspaceId: workspace.id,
        docId,
        spaceId: space2.id,
      },
    });

    // Verify doc is removed from space1
    result = await rawGql(getSpaceWithDocIdsQuery, {
      workspaceId: workspace.id,
      spaceId: space1.id,
    });
    t.is(result.getSpace.docCount, 0, 'Space1 should have 0 docs after move');
    t.deepEqual(
      result.getSpace.docIds,
      [],
      'Space1 docIds should be empty after move'
    );

    // Verify doc is now in space2
    result = await rawGql(getSpaceWithDocIdsQuery, {
      workspaceId: workspace.id,
      spaceId: space2.id,
    });
    t.is(result.getSpace.docCount, 1, 'Space2 should have 1 doc after move');
    t.deepEqual(
      result.getSpace.docIds,
      [docId],
      'Space2 docIds should contain moved doc'
    );
  }
);

e2e('moveDocToSpace should handle moving to workspace root', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const space = await app.create(Mockers.Space, {
    workspace: { id: workspace.id },
    owner: { id: owner.id },
    defaultRole: DocRole.Editor,
  });

  // Create a doc and add it to space
  const docId = 'test-doc-for-move';
  await app.create(Mockers.DocSnapshot, {
    user: { id: owner.id },
    workspaceId: workspace.id,
    docId,
  });
  await app.create(Mockers.SpaceDoc, {
    space: { id: space.id },
    docId,
  });

  // Verify space has the doc
  let result = await rawGql(getSpaceWithDocIdsQuery, {
    workspaceId: workspace.id,
    spaceId: space.id,
  });
  t.is(result.getSpace.docCount, 1, 'Space should have 1 doc');

  // Move doc to workspace root (null spaceId)
  await rawGql(moveDocToSpaceMutation, {
    input: {
      workspaceId: workspace.id,
      docId,
      spaceId: null,
    },
  });

  // Verify doc is removed from space
  result = await rawGql(getSpaceWithDocIdsQuery, {
    workspaceId: workspace.id,
    spaceId: space.id,
  });
  t.is(
    result.getSpace.docCount,
    0,
    'Space should have 0 docs after move to workspace root'
  );
  t.deepEqual(
    result.getSpace.docIds,
    [],
    'Space docIds should be empty after move'
  );
});

e2e(
  'user without space access should not be able to move doc to space',
  async t => {
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

    // Create space with no default access (member can't access)
    const space = await app.create(Mockers.Space, {
      workspace: { id: workspace.id },
      owner: { id: owner.id },
      defaultRole: DocRole.External, // No access for workspace members
    });

    // Create a doc in the workspace
    const docId = 'test-doc-for-move';
    await app.create(Mockers.DocSnapshot, {
      user: { id: owner.id },
      workspaceId: workspace.id,
      docId,
    });

    // Login as member
    await app.login(member);

    // Member should not be able to move doc to space they don't have access to
    await t.throwsAsync(
      async () => {
        await rawGql(moveDocToSpaceMutation, {
          input: {
            workspaceId: workspace.id,
            docId,
            spaceId: space.id,
          },
        });
      },
      { message: /denied|permission|access/i }
    );
  }
);
