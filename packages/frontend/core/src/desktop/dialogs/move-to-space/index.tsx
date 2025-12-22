import { Button, Menu, MenuItem, Modal, notify } from '@affine/component';
import {
  type IconData,
  IconRenderer,
  IconType,
} from '@affine/component/ui/icon-picker';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import type { DialogComponentProps } from '@affine/core/modules/dialogs';
import type { WORKSPACE_DIALOG_SCHEMA } from '@affine/core/modules/dialogs/constant';
import { DocsService } from '@affine/core/modules/doc';
import { SpaceService } from '@affine/core/modules/space';
import type { SpaceIconData } from '@affine/core/modules/space/stores/space';
import { useI18n } from '@affine/i18n';
import { FolderIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import * as styles from './style.css';

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

// Component to render the space icon
const SpaceIconDisplay = ({ icon }: { icon: SpaceIconData | undefined }) => {
  const iconData = useMemo(() => (icon ? parseIconData(icon) : null), [icon]);

  if (!iconData) {
    return <FolderIcon />;
  }

  return <IconRenderer data={iconData} />;
};

export const MoveToSpaceDialog = ({
  close,
  docId,
}: DialogComponentProps<WORKSPACE_DIALOG_SCHEMA['move-to-space']>) => {
  const t = useI18n();
  const spaceService = useService(SpaceService);
  const docsService = useService(DocsService);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  const spaces = useLiveData(spaceService.spacesList$);
  const docRecord = useLiveData(docsService.list.doc$(docId));
  const docTitle = useLiveData(docRecord?.title$) || t['Untitled']();

  // Load spaces on mount
  useEffect(() => {
    spaceService.loadSpaces().catch(console.error);
  }, [spaceService]);

  const selectedSpace = spaces.find(s => s.id === selectedSpaceId);
  const selectedSpaceName = useLiveData(selectedSpace?.name$);

  const handleMove = useAsyncCallback(async () => {
    setIsMoving(true);
    try {
      await spaceService.moveDocToSpace(docId, selectedSpaceId);
      notify.success({
        title: selectedSpaceId
          ? t['com.affine.space.docMoved']()
          : t['com.affine.space.docRemoved'](),
      });
      close();
    } catch (error) {
      console.error('Failed to move doc:', error);
      notify.error({
        title:
          t['com.affine.space.moveDocFailed']?.() || 'Failed to move document',
      });
    } finally {
      setIsMoving(false);
    }
  }, [spaceService, docId, selectedSpaceId, t, close]);

  const onCancel = useCallback(() => {
    close();
  }, [close]);

  return (
    <Modal
      open
      onOpenChange={onCancel}
      width={400}
      contentOptions={{
        style: {
          padding: 0,
          backgroundColor: 'var(--affine-background-primary-color)',
        },
      }}
    >
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.title}>
            {t['com.affine.space.moveToSpace']?.() || 'Move to Space'}
          </span>
        </div>

        <div className={styles.content}>
          <div className={styles.docInfo}>
            <span className={styles.label}>
              {t['com.affine.space.movingDoc']?.() || 'Moving document:'}
            </span>
            <span className={styles.docTitle}>{docTitle}</span>
          </div>

          <div className={styles.selectWrapper}>
            <span className={styles.label}>
              {t['com.affine.space.selectDestination']?.() ||
                'Select destination:'}
            </span>
            <Menu
              items={
                <>
                  <MenuItem
                    prefixIcon={<FolderIcon />}
                    onSelect={() => setSelectedSpaceId(null)}
                    selected={selectedSpaceId === null}
                  >
                    {t['com.affine.space.workspaceRoot']?.() ||
                      'Workspace Root'}
                  </MenuItem>
                  {spaces.map(space => (
                    <SpaceMenuItem
                      key={space.id}
                      spaceId={space.id}
                      selected={selectedSpaceId === space.id}
                      onSelect={() => setSelectedSpaceId(space.id)}
                    />
                  ))}
                </>
              }
              contentOptions={{
                align: 'start',
              }}
            >
              <Button variant="secondary" className={styles.selectButton}>
                {selectedSpaceId === null
                  ? t['com.affine.space.workspaceRoot']?.() || 'Workspace Root'
                  : selectedSpaceName || t['Untitled']()}
              </Button>
            </Menu>
          </div>
        </div>

        <div className={styles.footer}>
          <Button variant="secondary" onClick={onCancel}>
            {t['Cancel']()}
          </Button>
          <Button variant="primary" onClick={handleMove} disabled={isMoving}>
            {isMoving
              ? t['com.affine.space.moving']?.() || 'Moving...'
              : t['com.affine.space.move']?.() || 'Move'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const SpaceMenuItem = ({
  spaceId,
  selected,
  onSelect,
}: {
  spaceId: string;
  selected: boolean;
  onSelect: () => void;
}) => {
  const spaceService = useService(SpaceService);
  const space = useLiveData(spaceService.space$(spaceId));
  const name = useLiveData(space?.name$);
  const icon = useLiveData(space?.icon$);

  return (
    <MenuItem
      prefixIcon={<SpaceIconDisplay icon={icon} />}
      onSelect={onSelect}
      selected={selected}
    >
      {name || 'Untitled'}
    </MenuItem>
  );
};
