import { Module } from '@nestjs/common';

import { AccessControllerBuilder } from './builder';
import { DocAccessController } from './doc';
import { EventsListener } from './event';
import { SpaceAccessController } from './space';
import { WorkspaceAccessController } from './workspace';

@Module({
  providers: [
    WorkspaceAccessController,
    DocAccessController,
    SpaceAccessController,
    AccessControllerBuilder,
    EventsListener,
  ],
  exports: [AccessControllerBuilder],
})
export class PermissionModule {}

export { AccessControllerBuilder as AccessController } from './builder';
export {
  DOC_ACTIONS,
  type DocAction,
  DocRole,
  SPACE_ACTIONS,
  type SpaceAction,
  type SpaceRole,
  WORKSPACE_ACTIONS,
  type WorkspaceAction,
  WorkspaceRole,
} from './types';
