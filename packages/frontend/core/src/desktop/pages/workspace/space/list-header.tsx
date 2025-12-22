import { IconButton, Menu, MenuItem, toast } from '@affine/component';
import {
  type IconData,
  IconRenderer,
  IconType,
} from '@affine/component/ui/icon-picker';
import { SpaceDeleteModal } from '@affine/core/desktop/dialogs/space-setting/delete-space-modal';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { type Space, SpaceService } from '@affine/core/modules/space';
import type { SpaceIconData } from '@affine/core/modules/space/stores/space';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import {
  DeleteIcon,
  FolderIcon,
  MoreVerticalIcon,
  SettingsIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useMemo, useState } from 'react';

import * as styles from './list-header.css';

// Convert SpaceIconData to IconData for rendering
function parseIconData(icon: SpaceIconData): IconData | null {
  if (!icon) return null;
  if (icon.type === 'emoji') {
    return { type: IconType.Emoji, unicode: icon.unicode };
  } else if (icon.type === 'affine-icon') {
    return {
      type: IconType.AffineIcon,
      name: icon.name,
      color: icon.color,
    };
  }
  return null;
}

export const SpaceListHeader = ({ space }: { space: Space }) => {
  const t = useI18n();
  const spaceName = useLiveData(space.name$);
  const spaceIcon = useLiveData(space.icon$);
  const { workspaceDialogService, spaceService } = useServices({
    WorkspaceDialogService,
    SpaceService,
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const iconData = useMemo(
    () => (spaceIcon ? parseIconData(spaceIcon) : null),
    [spaceIcon]
  );

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
            {iconData ? (
              <span className={styles.spaceIcon}>
                <IconRenderer data={iconData} />
              </span>
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
