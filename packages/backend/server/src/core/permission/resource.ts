import {
  DocAction,
  DocRole,
  SpaceAction,
  SpaceRole,
  WorkspaceAction,
  WorkspaceRole,
} from './types';

export type ResourceType = 'ws' | 'doc' | 'space';

interface WorkspaceResource {
  type: 'ws';
  payload: {
    allowLocal?: boolean;
    workspaceId: string;
    userId: string;
  };
  action: WorkspaceAction;
  role: WorkspaceRole;
}

interface DocResource {
  type: 'doc';
  payload: {
    allowLocal?: boolean;
    workspaceId: string;
    docId: string;
    userId: string;
  };
  action: DocAction;
  role: DocRole;
}

interface SpaceResource {
  type: 'space';
  payload: {
    workspaceId: string;
    spaceId: string;
    userId: string;
  };
  action: SpaceAction;
  role: SpaceRole;
}

export type KnownResource = WorkspaceResource | DocResource | SpaceResource;
export type Resource<Type extends ResourceType = 'ws'> = Extract<
  KnownResource,
  { type: Type }
>['payload'];

export type ResourceRole<Type extends ResourceType> = Extract<
  KnownResource,
  { type: Type }
>['role'];

export type ResourceAction<Type extends ResourceType> = Extract<
  KnownResource,
  { type: Type }
>['action'];
