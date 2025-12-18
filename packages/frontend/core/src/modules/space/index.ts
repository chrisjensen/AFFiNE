export { Space } from './entities/space';
export { SpaceService } from './services/space';
export { SpaceMembersService } from './services/space-members';
export type {
  CreateSpaceInput,
  SpaceInfo,
  SpaceMember,
  UpdateSpaceInput,
} from './stores/space';
export { DocRole, numericToDocRole, SpaceStore } from './stores/space';

import { type Framework } from '@toeverything/infra';

import { WorkspaceServerService } from '../cloud/services/workspace-server';
import { DocCreateMiddleware } from '../doc';
import { GlobalContextService } from '../global-context';
import { WorkbenchService } from '../workbench';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { Space } from './entities/space';
import { SpaceDocCreateMiddleware } from './impls/space-doc-create-middleware';
import { SpaceService } from './services/space';
import { SpaceMembersService } from './services/space-members';
import { SpaceStore } from './stores/space';

export function configureSpaceModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .store(SpaceStore, [WorkspaceServerService, WorkspaceService])
    .service(SpaceService, [SpaceStore])
    .service(SpaceMembersService, [SpaceStore])
    .entity(Space, [SpaceStore])
    .impl(DocCreateMiddleware('space'), SpaceDocCreateMiddleware, [
      SpaceService,
      GlobalContextService,
      WorkbenchService,
    ]);
}
