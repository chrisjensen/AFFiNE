import { forwardRef, Module } from '@nestjs/common';

import { DocStorageModule } from '../doc';
import { PermissionModule } from '../permission';
import { WorkspaceModule } from '../workspaces';
import { DocRendererController } from './controller';

@Module({
  imports: [
    DocStorageModule,
    PermissionModule,
    forwardRef(() => WorkspaceModule),
  ],
  controllers: [DocRendererController],
})
export class DocRendererModule {}
