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
