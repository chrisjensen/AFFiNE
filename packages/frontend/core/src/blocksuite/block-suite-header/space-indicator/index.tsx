import { Menu, MenuItem, toast } from '@affine/component';
import {
  type IconData,
  IconRenderer,
  IconType,
} from '@affine/component/ui/icon-picker';
import { type Space, SpaceService } from '@affine/core/modules/space';
import { useI18n } from '@affine/i18n';
import { FolderIcon, HomeIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useMemo, useState } from 'react';

import * as styles from './styles.css';

// Helper to parse icon string to IconData for rendering
function parseIconData(icon: string | null | undefined): IconData | null {
  if (!icon) return null;
  // Try to parse as JSON (AffineIcon format)
  if (icon.startsWith('{')) {
    try {
      const parsed = JSON.parse(icon);
      if (parsed.type === 'affine-icon') {
        return {
          type: IconType.AffineIcon,
          name: parsed.name,
          color: parsed.color,
        };
      }
    } catch {
      // Not valid JSON, treat as emoji
    }
  }
  // Treat as emoji unicode
  return { type: IconType.Emoji, unicode: icon };
}

interface SpaceIndicatorProps {
  docId: string;
}

export const SpaceIndicator = ({ docId }: SpaceIndicatorProps) => {
  const t = useI18n();
  const spaceService = useService(SpaceService);
  const [isOpen, setIsOpen] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  // Get the current space this doc belongs to
  const currentSpace = useLiveData(spaceService.spaceForDoc$(docId));
  const spaceName = useLiveData(currentSpace?.name$);
  const spaceIcon = useLiveData(currentSpace?.icon$);

  // Get all available spaces
  const spacesList = useLiveData(spaceService.spacesList$);

  const handleMoveToSpace = useCallback(
    async (targetSpaceId: string | null) => {
      if (isMoving) return;

      // Don't move if already in the same space
      if (targetSpaceId === currentSpace?.id) {
        setIsOpen(false);
        return;
      }
      if (targetSpaceId === null && !currentSpace) {
        setIsOpen(false);
        return;
      }

      setIsMoving(true);
      try {
        await spaceService.moveDocToSpace(docId, targetSpaceId);
        if (targetSpaceId) {
          toast(t['com.affine.space.docMoved']());
        } else {
          toast(t['com.affine.space.docRemoved']());
        }
        setIsOpen(false);
      } catch (error) {
        console.error('Failed to move doc to space:', error);
        toast(t['com.affine.space.moveDocFailed']());
      } finally {
        setIsMoving(false);
      }
    },
    [currentSpace, docId, isMoving, spaceService, t]
  );

  // If there are no spaces, don't show the indicator
  if (spacesList.length === 0 && !currentSpace) {
    return null;
  }

  return (
    <Menu
      rootOptions={{
        open: isOpen,
        onOpenChange: setIsOpen,
      }}
      contentOptions={{
        side: 'bottom',
        align: 'start',
        sideOffset: 8,
        className: styles.menuContent,
      }}
      items={
        <>
          <div className={styles.menuHeader}>
            {t['com.affine.space.moveToSpace']()}
          </div>
          {spacesList.map(space => (
            <SpaceMenuItemComponent
              key={space.id}
              space={space}
              isSelected={space.id === currentSpace?.id}
              onClick={() => void handleMoveToSpace(space.id)}
              disabled={isMoving}
            />
          ))}
          <MenuItem
            className={styles.workspaceRootItem}
            prefixIcon={<HomeIcon />}
            selected={!currentSpace}
            onClick={() => void handleMoveToSpace(null)}
            disabled={isMoving || !currentSpace}
          >
            {t['com.affine.space.workspaceRoot']()}
          </MenuItem>
        </>
      }
    >
      <button
        className={styles.spaceIndicator}
        aria-label={
          currentSpace
            ? `${t['com.affine.space.space']()}: ${spaceName}`
            : t['com.affine.space.workspaceRoot']()
        }
        title={
          currentSpace
            ? `${t['com.affine.space.space']()}: ${spaceName}`
            : t['com.affine.space.workspaceRoot']()
        }
        tabIndex={0}
      >
        <span className={styles.spaceIcon}>
          {currentSpace ? <SpaceIconDisplay icon={spaceIcon} /> : <HomeIcon />}
        </span>
        <span className={styles.spaceName}>
          {currentSpace
            ? spaceName || t['Untitled']()
            : t['com.affine.space.workspaceRoot']()}
        </span>
      </button>
    </Menu>
  );
};

// Component to render the space icon
const SpaceIconDisplay = ({ icon }: { icon: string | null | undefined }) => {
  const iconData = useMemo(() => parseIconData(icon), [icon]);

  if (!iconData) {
    return <FolderIcon />;
  }

  return <IconRenderer data={iconData} />;
};

const SpaceMenuItemComponent = ({
  space,
  isSelected,
  onClick,
  disabled,
}: {
  space: Space;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) => {
  const t = useI18n();
  const name = useLiveData(space.name$);
  const icon = useLiveData(space.icon$);

  return (
    <MenuItem
      prefixIcon={<SpaceIconDisplay icon={icon} />}
      selected={isSelected}
      onClick={onClick}
      disabled={disabled}
    >
      {name || t['Untitled']()}
    </MenuItem>
  );
};
