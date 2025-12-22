import { forwardRef, Module } from '@nestjs/common';

import { DocStorageModule } from '../doc';
import { DocRendererModule } from '../doc-renderer';
import { FeatureModule } from '../features';
import { MailModule } from '../mail';
import { NotificationModule } from '../notification';
import { PermissionModule } from '../permission';
import { QuotaModule } from '../quota';
import { StorageModule } from '../storage';
import { UserModule } from '../user';
import { WorkspacesController } from './controller';
import { DocMoveService } from './doc-move';
import { WorkspaceEvents } from './event';
import {
  DocHistoryResolver,
  DocResolver,
  SpaceResolver,
  WorkspaceBlobResolver,
  WorkspaceDocResolver,
  WorkspaceMemberResolver,
  WorkspaceResolver,
  WorkspaceSpaceResolver,
} from './resolvers';
import { WorkspaceService } from './service';

@Module({
  imports: [
    DocStorageModule,
    forwardRef(() => DocRendererModule),
    FeatureModule,
    QuotaModule,
    StorageModule,
    UserModule,
    PermissionModule,
    NotificationModule,
    MailModule,
  ],
  controllers: [WorkspacesController],
  providers: [
    WorkspaceResolver,
    WorkspaceMemberResolver,
    WorkspaceDocResolver,
    DocResolver,
    DocHistoryResolver,
    WorkspaceBlobResolver,
    WorkspaceSpaceResolver,
    SpaceResolver,
    WorkspaceService,
    WorkspaceEvents,
    DocMoveService,
  ],
  exports: [WorkspaceService, DocMoveService],
})
export class WorkspaceModule {}

export { DocMoveService } from './doc-move';
export { WorkspaceService } from './service';
export { InvitationType, WorkspaceType } from './types';
