import { IconButton, Menu, MenuItem, toast } from '@affine/component';
import { SpaceDeleteModal } from '@affine/core/desktop/dialogs/space-setting/delete-space-modal';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { type Space, SpaceService } from '@affine/core/modules/space';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import {
  DeleteIcon,
  FolderIcon,
  MoreVerticalIcon,
  SettingsIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService, useServices } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import * as styles from './list-header.css';

export const SpaceListHeader = ({ space }: { space: Space }) => {
  const t = useI18n();
  const spaceName = useLiveData(space.name$);
  const spaceIcon = useLiveData(space.icon$);
  const { workspaceDialogService, spaceService } = useServices({
    WorkspaceDialogService,
    SpaceService,
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleOpenSettings = useCallback(() => {
    workspaceDialogService.open('space-setting', { spaceId: space.id });
  }, [workspaceDialogService, space.id]);

  const handleDelete = useCallback(() => {
    setShowDeleteModal(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    spaceService.deleteSpace(space.id).catch(console.error);
    toast(t['com.affine.space.deleted']());
    setShowDeleteModal(false);
  }, [space, spaceService, t]);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.breadcrumb}>
          <div className={styles.breadcrumbItem}>
            <WorkbenchLink to="/all" className={styles.breadcrumbLink}>
              {t['All pages']()}
            </WorkbenchLink>
          </div>
          <div className={styles.breadcrumbSeparator}>/</div>
          <div className={styles.breadcrumbItem} data-active={true}>
            {spaceIcon ? (
              <span className={styles.spaceIcon}>{spaceIcon}</span>
            ) : (
              <FolderIcon className={styles.breadcrumbIcon} />
            )}
            <span className={styles.spaceName}>
              {spaceName || t['Untitled']()}
            </span>
            <Menu
              items={
                <>
                  <MenuItem
                    prefixIcon={<SettingsIcon />}
                    onClick={handleOpenSettings}
                    data-testid="space-header-settings"
                  >
                    {t['com.affine.space.settings']()}
                  </MenuItem>
                  <MenuItem
                    type="danger"
                    prefixIcon={<DeleteIcon />}
                    onClick={handleDelete}
                    data-testid="space-header-delete"
                  >
                    {t['Delete']()}
                  </MenuItem>
                </>
              }
              contentOptions={{
                align: 'end',
              }}
            >
              <IconButton
                size="16"
                data-testid="space-header-more-button"
                className={styles.moreButton}
              >
                <MoreVerticalIcon />
              </IconButton>
            </Menu>
          </div>
        </div>

        <div className={styles.headerActions}></div>
      </header>
      <SpaceDeleteModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        spaceName={spaceName || ''}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
};
