import { Store } from '@toeverything/infra';

import type { WorkspaceServerService } from '../../cloud/services/workspace-server';
import type { WorkspaceService } from '../../workspace';

// Define types locally until GraphQL codegen runs
export enum DocRole {
  External = 0,
  Reader = 10,
  Commenter = 20,
  Editor = 30,
  Manager = 40,
  Owner = 99,
}

export interface SpaceInfo {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  defaultRole: DocRole;
  role: DocRole;
  createdAt: string;
  updatedAt: string;
  docCount: number;
  docIds?: string[];
}

export interface SpaceMember {
  role: DocRole;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
}

export interface CreateSpaceInput {
  workspaceId: string;
  name: string;
  description?: string;
  defaultRole?: DocRole;
}

export interface UpdateSpaceInput {
  name?: string;
  description?: string;
  defaultRole?: DocRole;
}

export class SpaceStore extends Store {
  constructor(
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly workspaceService: WorkspaceService
  ) {
    super();
  }

  // Helper to execute raw GraphQL queries without type checking
  // This is temporary until the Space GraphQL schema is generated
  private async rawGql<T>(
    queryDef: { id: string; query: string },
    variables: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<T> {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const result = await (this.workspaceServerService.server as any).gql({
      query: queryDef,
      variables,
      context: { signal },
    });
    return result as T;
  }

  private get workspaceId(): string {
    const workspace = this.workspaceService.workspace;
    if (!workspace) {
      throw new Error('Workspace not found');
    }
    return workspace.id;
  }

  async listSpaces(signal?: AbortSignal): Promise<SpaceInfo[]> {
    const query = {
      id: 'listWorkspaceSpacesQuery',
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
            docIds
          }
        }
      }`,
    };

    const data = await this.rawGql<{ workspace?: { spaces?: SpaceInfo[] } }>(
      query,
      { workspaceId: this.workspaceId },
      signal
    );

    return data.workspace?.spaces ?? [];
  }

  async getSpace(
    spaceId: string,
    signal?: AbortSignal
  ): Promise<SpaceInfo | null> {
    const query = {
      id: 'getSpaceQuery',
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
          docIds
          owner {
            id
            name
            avatarUrl
          }
          permissions {
            Space_Read
            Space_Sync
            Space_CreateDoc
            Space_Delete
            Space_Users_Manage
            Space_Users_Read
            Space_Settings_Update
            Space_TransferOwner
          }
        }
      }`,
    };

    const data = await this.rawGql<{ getSpace?: SpaceInfo }>(
      query,
      { workspaceId: this.workspaceId, spaceId },
      signal
    );

    return data.getSpace ?? null;
  }

  async createSpace(
    input: CreateSpaceInput,
    signal?: AbortSignal
  ): Promise<SpaceInfo> {
    const mutation = {
      id: 'createSpaceMutation',
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

    const data = await this.rawGql<{ createSpace: SpaceInfo }>(
      mutation,
      {
        input: {
          ...input,
          workspaceId: this.workspaceId,
        },
      },
      signal
    );

    return data.createSpace;
  }

  async updateSpace(
    spaceId: string,
    input: UpdateSpaceInput,
    signal?: AbortSignal
  ): Promise<SpaceInfo> {
    const mutation = {
      id: 'updateSpaceMutation',
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

    const data = await this.rawGql<{ updateSpace: SpaceInfo }>(
      mutation,
      { workspaceId: this.workspaceId, spaceId, input },
      signal
    );

    return data.updateSpace;
  }

  async deleteSpace(spaceId: string, signal?: AbortSignal): Promise<boolean> {
    const mutation = {
      id: 'deleteSpaceMutation',
      query: `mutation deleteSpace($workspaceId: String!, $spaceId: String!) {
        deleteSpace(workspaceId: $workspaceId, spaceId: $spaceId)
      }`,
    };

    const data = await this.rawGql<{ deleteSpace: boolean }>(
      mutation,
      { workspaceId: this.workspaceId, spaceId },
      signal
    );

    return data.deleteSpace;
  }

  async grantUserRole(
    spaceId: string,
    userId: string,
    role: DocRole,
    signal?: AbortSignal
  ): Promise<boolean> {
    const mutation = {
      id: 'grantSpaceUserRoleMutation',
      query: `mutation grantSpaceUserRole($workspaceId: String!, $input: GrantSpaceUserRoleInput!) {
        grantSpaceUserRole(workspaceId: $workspaceId, input: $input)
      }`,
    };

    const data = await this.rawGql<{ grantSpaceUserRole: boolean }>(
      mutation,
      {
        workspaceId: this.workspaceId,
        input: { spaceId, userId, role },
      },
      signal
    );

    return data.grantSpaceUserRole;
  }

  async revokeUserRole(
    spaceId: string,
    userId: string,
    signal?: AbortSignal
  ): Promise<boolean> {
    const mutation = {
      id: 'revokeSpaceUserRoleMutation',
      query: `mutation revokeSpaceUserRole($workspaceId: String!, $input: RevokeSpaceUserRoleInput!) {
        revokeSpaceUserRole(workspaceId: $workspaceId, input: $input)
      }`,
    };

    const data = await this.rawGql<{ revokeSpaceUserRole: boolean }>(
      mutation,
      {
        workspaceId: this.workspaceId,
        input: { spaceId, userId },
      },
      signal
    );

    return data.revokeSpaceUserRole;
  }

  async moveDocToSpace(
    docId: string,
    spaceId: string | null,
    signal?: AbortSignal
  ): Promise<boolean> {
    const mutation = {
      id: 'moveDocToSpaceMutation',
      query: `mutation moveDocToSpace($input: MoveDocToSpaceInput!) {
        moveDocToSpace(input: $input)
      }`,
    };

    const data = await this.rawGql<{ moveDocToSpace: boolean }>(
      mutation,
      {
        input: {
          workspaceId: this.workspaceId,
          docId,
          spaceId,
        },
      },
      signal
    );

    return data.moveDocToSpace;
  }
}
