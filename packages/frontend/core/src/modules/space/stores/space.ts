import { Store } from '@toeverything/infra';

import type { WorkspaceServerService } from '../../cloud/services/workspace-server';
import type { WorkspaceService } from '../../workspace';

// Define types locally until GraphQL codegen runs
// Values must match GraphQL enum names from backend schema.gql
export enum DocRole {
  None = 'None',
  External = 'External',
  Reader = 'Reader',
  Commenter = 'Commenter',
  Editor = 'Editor',
  Manager = 'Manager',
  Owner = 'Owner',
}

// Backend stores defaultRole as numeric values (Int in GraphQL)
// This maps numeric values to DocRole enum strings
const NUMERIC_TO_DOC_ROLE: Record<number, DocRole> = {
  [-32768]: DocRole.None, // -(1 << 15)
  0: DocRole.External,
  10: DocRole.Reader,
  15: DocRole.Commenter,
  20: DocRole.Editor,
  30: DocRole.Manager,
  99: DocRole.Owner,
};

export function numericToDocRole(
  value: number | DocRole | null | undefined
): DocRole {
  if (value === null || value === undefined) {
    return DocRole.External;
  }
  // If it's already a string (DocRole enum), return as-is
  if (typeof value === 'string') {
    return value as DocRole;
  }
  return NUMERIC_TO_DOC_ROLE[value] ?? DocRole.External;
}

// Icon data stored as JSONB in database
export type SpaceIconData =
  | { type: 'emoji'; unicode: string }
  | { type: 'affine-icon'; name: string; color: string }
  | null;

export interface SpaceInfo {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  icon: SpaceIconData;
  // defaultRole comes from GraphQL as Int (number), but we convert to DocRole string
  defaultRole: number | DocRole;
  // role comes from GraphQL as DocRole enum (string)
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
  icon?: SpaceIconData;
  defaultRole?: DocRole;
}

export interface UpdateSpaceInput {
  name?: string;
  description?: string;
  icon?: SpaceIconData;
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
            icon
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

  async getHiddenDocIds(signal?: AbortSignal): Promise<string[]> {
    const query = {
      id: 'getHiddenDocIdsQuery',
      query: `query getHiddenDocIds($workspaceId: String!) {
        workspace(id: $workspaceId) {
          hiddenDocIds
        }
      }`,
    };

    const data = await this.rawGql<{ workspace?: { hiddenDocIds?: string[] } }>(
      query,
      { workspaceId: this.workspaceId },
      signal
    );

    return data.workspace?.hiddenDocIds ?? [];
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
          icon
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
          icon
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
          icon
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

  async getSpaceMembers(
    spaceId: string,
    pagination: { first?: number; after?: string },
    signal?: AbortSignal
  ): Promise<{
    edges: Array<{ node: SpaceMember }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    totalCount: number;
  }> {
    const query = {
      id: 'getSpaceMembersQuery',
      query: `query getSpaceMembers($workspaceId: String!, $spaceId: String!, $first: Int, $after: String) {
        getSpace(workspaceId: $workspaceId, spaceId: $spaceId) {
          members(pagination: { first: $first, after: $after }) {
            edges {
              node {
                role
                user {
                  id
                  name
                  email
                  avatarUrl
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
            totalCount
          }
        }
      }`,
    };

    const data = await this.rawGql<{
      getSpace?: {
        members: {
          edges: Array<{ node: SpaceMember }>;
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          totalCount: number;
        };
      };
    }>(
      query,
      {
        workspaceId: this.workspaceId,
        spaceId,
        first: pagination.first,
        after: pagination.after,
      },
      signal
    );

    return (
      data.getSpace?.members ?? {
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: null },
        totalCount: 0,
      }
    );
  }
}
