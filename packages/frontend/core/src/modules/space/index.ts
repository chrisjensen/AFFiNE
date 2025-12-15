export { Space } from './entities/space';
export { SpaceService } from './services/space';
export type {
  CreateSpaceInput,
  DocRole,
  SpaceInfo,
  SpaceMember,
  UpdateSpaceInput,
} from './stores/space';
export { SpaceStore } from './stores/space';

import { type Framework } from '@toeverything/infra';

import { WorkspaceServerService } from '../cloud/services/workspace-server';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { Space } from './entities/space';
import { SpaceService } from './services/space';
import { SpaceStore } from './stores/space';

export function configureSpaceModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .store(SpaceStore, [WorkspaceServerService, WorkspaceService])
    .service(SpaceService, [SpaceStore])
    .entity(Space, [SpaceStore]);
}
