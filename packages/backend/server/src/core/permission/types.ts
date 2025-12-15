import { LeafPaths, LeafVisitor } from '../../base';
import { DocRole, WorkspaceRole } from '../../models';

export { DocRole, WorkspaceRole };
/**
 * Definitions of all possible actions
 *
 * NOTE(@forehalo): if you add any new actions, please don't forget to add the corresponding role in [RoleActionsMap]
 */
export const Actions = {
  // Workspace Actions
  Workspace: {
    Read: '',
    Sync: '',
    CreateDoc: '',
    Delete: '',
    TransferOwner: '',
    Organize: {
      Read: '',
    },
    Users: {
      Read: '',
      Manage: '',
    },
    Administrators: {
      Manage: '',
    },
    Properties: {
      Read: '',
      Create: '',
      Update: '',
      Delete: '',
    },
    Settings: {
      Read: '',
      Update: '',
    },
    Blobs: {
      Read: '',
      List: '',
      Write: '',
    },
    Copilot: '',
    Payment: {
      Manage: '',
    },
  },

  // Doc Actions
  Doc: {
    Read: '',
    Copy: '',
    Duplicate: '',
    Trash: '',
    Restore: '',
    Delete: '',
    Update: '',
    Publish: '',
    TransferOwner: '',
    Properties: {
      Read: '',
      Update: '',
    },
    Users: {
      Read: '',
      Manage: '',
    },
    Comments: {
      Read: '',
      Create: '',
      Update: '',
      Delete: '',
      Resolve: '',
    },
  },

  // Space Actions (permission-isolated containers within a workspace)
  Space: {
    Read: '',
    Sync: '',
    CreateDoc: '',
    Delete: '',
    TransferOwner: '',
    Users: {
      Read: '',
      Manage: '',
    },
    Settings: {
      Read: '',
      Update: '',
    },
  },
} as const;

export const RoleActionsMap = {
  WorkspaceRole: {
    get [WorkspaceRole.External]() {
      return [
        Action.Workspace.Read,
        Action.Workspace.Organize.Read,
        Action.Workspace.Properties.Read,
        Action.Workspace.Blobs.Read,
      ];
    },
    get [WorkspaceRole.Collaborator]() {
      return [
        ...this[WorkspaceRole.External],
        Action.Workspace.Sync,
        Action.Workspace.CreateDoc,
        Action.Workspace.Users.Read,
        Action.Workspace.Settings.Read,
        Action.Workspace.Blobs.Write,
        Action.Workspace.Blobs.List,
        Action.Workspace.Copilot,
      ];
    },
    get [WorkspaceRole.Admin]() {
      return [
        ...this[WorkspaceRole.Collaborator],
        Action.Workspace.Users.Manage,
        Action.Workspace.Settings.Update,
        Action.Workspace.Properties.Create,
        Action.Workspace.Properties.Update,
        Action.Workspace.Properties.Delete,
      ];
    },
    get [WorkspaceRole.Owner]() {
      return [
        ...this[WorkspaceRole.Admin],
        Action.Workspace.Delete,
        Action.Workspace.Administrators.Manage,
        Action.Workspace.TransferOwner,
        Action.Workspace.Payment.Manage,
      ];
    },
  },
  DocRole: {
    get [DocRole.External]() {
      return [
        Action.Doc.Read,
        Action.Doc.Copy,
        Action.Doc.Properties.Read,
        Action.Doc.Comments.Read,
      ];
    },
    get [DocRole.Reader]() {
      return [
        ...this[DocRole.External],
        Action.Doc.Users.Read,
        Action.Doc.Duplicate,
      ];
    },
    get [DocRole.Commenter]() {
      return [...this[DocRole.Reader], Action.Doc.Comments.Create];
    },
    get [DocRole.Editor]() {
      return [
        ...this[DocRole.Reader],
        ...this[DocRole.Commenter],
        Action.Doc.Trash,
        Action.Doc.Restore,
        Action.Doc.Delete,
        Action.Doc.Properties.Update,
        Action.Doc.Update,
        Action.Doc.Comments.Resolve,
        Action.Doc.Comments.Delete,
      ];
    },
    get [DocRole.Manager]() {
      return [
        ...this[DocRole.Editor],
        Action.Doc.Publish,
        Action.Doc.Users.Manage,
      ];
    },
    get [DocRole.Owner]() {
      return [...this[DocRole.Manager], Action.Doc.TransferOwner];
    },
  },
  // Space roles use DocRole values but map to Space actions
  SpaceRole: {
    get [DocRole.External]() {
      return [Action.Space.Read, Action.Space.Settings.Read];
    },
    get [DocRole.Reader]() {
      return [...this[DocRole.External], Action.Space.Users.Read];
    },
    get [DocRole.Commenter]() {
      return this[DocRole.Reader];
    },
    get [DocRole.Editor]() {
      return [
        ...this[DocRole.Reader],
        Action.Space.Sync,
        Action.Space.CreateDoc,
      ];
    },
    get [DocRole.Manager]() {
      return [
        ...this[DocRole.Editor],
        Action.Space.Users.Manage,
        Action.Space.Settings.Update,
      ];
    },
    get [DocRole.Owner]() {
      return [
        ...this[DocRole.Manager],
        Action.Space.Delete,
        Action.Space.TransferOwner,
      ];
    },
  },
} as const;

type ResourceActionName<T extends keyof typeof Actions> =
  `${T}.${LeafPaths<(typeof Actions)[T]>}`;

export type WorkspaceAction = ResourceActionName<'Workspace'>;
export type DocAction = ResourceActionName<'Doc'>;
export type SpaceAction = ResourceActionName<'Space'>;
export type Action = WorkspaceAction | DocAction | SpaceAction;
export type WorkspaceActionPermissions = Record<WorkspaceAction, boolean>;
export type DocActionPermissions = Record<DocAction, boolean>;
export type SpaceActionPermissions = Record<SpaceAction, boolean>;

// Use DocRole for Space roles (same permission levels)
export type SpaceRole = DocRole;

const cache = new WeakMap<object, any>();
const buildPathReader = (
  obj: any,
  isLeaf: (val: any) => boolean,
  prefix?: string
): any => {
  if (cache.has(obj)) {
    return cache.get(obj);
  }

  const reader = new Proxy(obj, {
    get(target, prop) {
      if (typeof prop === 'symbol') {
        return undefined;
      }

      const newPath = prefix ? `${prefix}.${prop}` : prop;

      if (isLeaf(target[prop])) {
        return newPath;
      }

      return buildPathReader(target[prop], isLeaf, newPath);
    },
  });

  cache.set(obj, reader);
  return reader;
};

// Create the proxy that returns the path string
export const Action: LeafVisitor<typeof Actions> = buildPathReader(
  Actions,
  val => typeof val === 'string'
);

export const WORKSPACE_ACTIONS =
  RoleActionsMap.WorkspaceRole[WorkspaceRole.Owner];
export const DOC_ACTIONS = RoleActionsMap.DocRole[DocRole.Owner];
export const SPACE_ACTIONS = RoleActionsMap.SpaceRole[DocRole.Owner];

export function mapWorkspaceRoleToPermissions(
  workspaceRole: WorkspaceRole | null
) {
  const permissions = WORKSPACE_ACTIONS.reduce((map, action) => {
    map[action] = false;
    return map;
  }, {} as WorkspaceActionPermissions);

  if (workspaceRole === null) {
    return permissions;
  }

  RoleActionsMap.WorkspaceRole[workspaceRole].forEach(action => {
    permissions[action] = true;
  });

  return permissions;
}

export function mapDocRoleToPermissions(docRole: DocRole | null) {
  const permissions = DOC_ACTIONS.reduce((map, action) => {
    map[action] = false;
    return map;
  }, {} as DocActionPermissions);

  if (docRole === null || docRole === DocRole.None) {
    return permissions;
  }

  RoleActionsMap.DocRole[docRole].forEach(action => {
    permissions[action] = true;
  });

  return permissions;
}

export function mapSpaceRoleToPermissions(spaceRole: SpaceRole | null) {
  const permissions = SPACE_ACTIONS.reduce((map, action) => {
    map[action] = false;
    return map;
  }, {} as SpaceActionPermissions);

  if (spaceRole === null || spaceRole === DocRole.None) {
    return permissions;
  }

  RoleActionsMap.SpaceRole[spaceRole].forEach(action => {
    permissions[action] = true;
  });

  return permissions;
}

/**
 * Exchange the real operatable [DocRole] with [WorkspaceRole].
 *
 * Some [WorkspaceRole] has higher permission than the specified [DocRole].
 * for example the owner of the workspace can edit all the docs by default,
 * So [WorkspaceRole.Owner] will fixup [Doc.External] to [Doc.Manager]
 *
 * @example
 *
 * // Owner of the workspace but not specified a role in the doc
 * fixupDocRole(WorkspaceRole.Owner, DocRole.External) // returns DocRole.Manager
 */
export function fixupDocRole(
  workspaceRole: WorkspaceRole | null,
  docRole: DocRole | null
): DocRole | null {
  if (
    workspaceRole === null &&
    (docRole === null || docRole === DocRole.None)
  ) {
    return null;
  }

  workspaceRole = workspaceRole ?? WorkspaceRole.External;
  docRole = docRole ?? DocRole.External;

  switch (workspaceRole) {
    case WorkspaceRole.External:
      // Workspace External user won't be able to have any high permission doc role
      // set the maximum to Editor in case we have [Can Edit with share link] feature
      return Math.min(DocRole.Editor, docRole);
    // Workspace Owner will always fallback to Doc Owner
    case WorkspaceRole.Owner:
      return DocRole.Owner;
    // Workspace Admin will always fallback to Doc Manager
    case WorkspaceRole.Admin:
      return Math.max(DocRole.Manager, docRole);
    default:
      return docRole;
  }
}

/**
 * a map from [WorkspaceRole] to { [WorkspaceActionName]: boolean }
 */
const WorkspaceRolePermissionsMap = new Map(
  Object.values(WorkspaceRole)
    .filter(r => typeof r === 'number')
    .map(
      role =>
        [role, mapWorkspaceRoleToPermissions(role as WorkspaceRole)] as [
          WorkspaceRole,
          Record<WorkspaceAction, boolean>,
        ]
    )
);

/**
 * a map from [WorkspaceActionName] to required [WorkspaceRole]
 *
 * @testonly use [workspaceActionRequiredRole] instead
 */
export const WORKSPACE_ACTION_TO_MINIMAL_ROLE_MAP = new Map(
  RoleActionsMap.WorkspaceRole[WorkspaceRole.Owner].map(
    action =>
      [
        action,
        Math.min(
          ...[...WorkspaceRolePermissionsMap.entries()]
            .filter(([_, permissions]) => permissions[action])
            .map(([role, _]) => role)
        ),
      ] as [WorkspaceAction, WorkspaceRole]
  )
);

/**
 * a map from [DocRole] to { [DocActionName]: boolean }
 */
const DocRolePermissionsMap = new Map(
  Object.values(DocRole)
    .filter(r => typeof r === 'number')
    .map(docRole => {
      const permissions = mapDocRoleToPermissions(docRole as DocRole);
      return [docRole, permissions] as [DocRole, Record<DocAction, boolean>];
    })
);

/**
 * a map from [DocActionName] to required [DocRole]
 * @testonly use [docActionRequiredRole] instead
 */
export const DOC_ACTION_TO_MINIMAL_ROLE_MAP = new Map(
  RoleActionsMap.DocRole[DocRole.Owner].map(
    action =>
      [
        action,
        Math.min(
          ...[...DocRolePermissionsMap.entries()]
            .filter(([_, permissions]) => permissions[action])
            .map(([role, _]) => role)
        ),
      ] as [DocAction, DocRole]
  )
);

export function docActionRequiredRole(action: DocAction): DocRole {
  return (
    DOC_ACTION_TO_MINIMAL_ROLE_MAP.get(action) ??
    /* if we forget to put new action to [RoleActionsMap.DocRole] */ DocRole.Owner
  );
}

export function workspaceActionRequiredRole(
  action: WorkspaceAction
): WorkspaceRole {
  return (
    WORKSPACE_ACTION_TO_MINIMAL_ROLE_MAP.get(action) ??
    /* if we forget to put new action to [RoleActionsMap.WorkspaceRole] */ WorkspaceRole.Owner
  );
}

/**
 * a map from [SpaceRole] to { [SpaceActionName]: boolean }
 */
const SpaceRolePermissionsMap = new Map(
  Object.values(DocRole)
    .filter(r => typeof r === 'number')
    .map(spaceRole => {
      const permissions = mapSpaceRoleToPermissions(spaceRole as SpaceRole);
      return [spaceRole, permissions] as [
        SpaceRole,
        Record<SpaceAction, boolean>,
      ];
    })
);

/**
 * a map from [SpaceActionName] to required [SpaceRole]
 * @testonly use [spaceActionRequiredRole] instead
 */
export const SPACE_ACTION_TO_MINIMAL_ROLE_MAP = new Map(
  RoleActionsMap.SpaceRole[DocRole.Owner].map(
    action =>
      [
        action,
        Math.min(
          ...[...SpaceRolePermissionsMap.entries()]
            .filter(([_, permissions]) => permissions[action])
            .map(([role, _]) => role)
        ),
      ] as [SpaceAction, SpaceRole]
  )
);

export function spaceActionRequiredRole(action: SpaceAction): SpaceRole {
  return (
    SPACE_ACTION_TO_MINIMAL_ROLE_MAP.get(action) ??
    /* if we forget to put new action to [RoleActionsMap.SpaceRole] */ DocRole.Owner
  );
}
