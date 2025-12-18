import type { User } from '@prisma/client';

export interface Doc {
  /**
   * Can be workspace or user id.
   */
  spaceId: string;
  /**
   * The containing space ID. NULL means workspace root level (not in any space).
   * Used for space-scoped document storage.
   */
  containerSpaceId?: string;
  docId: string;
  blob: Uint8Array;
  timestamp: number;
  editorId?: string;
}

export type DocEditor = Pick<User, 'id' | 'name' | 'avatarUrl'>;

// TODO(@fengmk2): only used it inside the DocModel, use DocMode instead on the other places
export enum PublicDocMode {
  Page,
  Edgeless,
}

export enum DocMode {
  page = 'page',
  edgeless = 'edgeless',
}
