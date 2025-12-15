import { IconButton, usePromptModal } from '@affine/component';
import { NavigationPanelService } from '@affine/core/modules/navigation-panel';
import { type Space, SpaceService } from '@affine/core/modules/space';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { FolderIcon } from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useEffect, useMemo } from 'react';

import { CollapsibleSection } from '../../layouts/collapsible-section';
import { NavigationPanelSpaceNode } from '../../nodes/space';
import { NavigationPanelTreeRoot } from '../../tree';
import { RootEmpty } from './empty';
import * as styles from './index.css';

export const NavigationPanelSpaces = () => {
  const t = useI18n();
  const { spaceService, workbenchService, navigationPanelService } =
    useServices({
      SpaceService,
      WorkbenchService,
      NavigationPanelService,
    });
  const spaces = useLiveData(spaceService.spacesList$);
  const isLoading = useLiveData(spaceService.isLoading$);
  const { openPromptModal } = usePromptModal();
  const path = useMemo(() => ['spaces'], []);

  // Load spaces when component mounts
  useEffect(() => {
    spaceService.loadSpaces().catch(console.error);
  }, [spaceService]);

  const handleCreateSpace = useCallback(() => {
    openPromptModal({
      title: t['com.affine.rootAppSidebar.spaces.create'](),
      label: t['com.affine.rootAppSidebar.spaces.name'](),
      inputOptions: {
        placeholder: t['com.affine.rootAppSidebar.spaces.name.placeholder'](),
      },
      children: (
        <div className={styles.createTips}>
          {t['com.affine.rootAppSidebar.spaces.createTips']()}
        </div>
      ),
      confirmText: t['Create'](),
      cancelText: t['Cancel'](),
      confirmButtonOptions: {
        variant: 'primary',
      },
      onConfirm(name: string) {
        spaceService
          .createSpace({ name })
          .then((space: Space) => {
            workbenchService.workbench.openSpace(space.id);
            navigationPanelService.setCollapsed(path, false);
          })
          .catch(console.error);
      },
    });
  }, [
    spaceService,
    navigationPanelService,
    openPromptModal,
    path,
    t,
    workbenchService.workbench,
  ]);

  return (
    <CollapsibleSection
      path={path}
      testId="navigation-panel-spaces"
      title={t['com.affine.rootAppSidebar.spaces']()}
      actions={
        <IconButton
          data-testid="navigation-panel-bar-add-space-button"
          onClick={handleCreateSpace}
          size="16"
          tooltip={t['com.affine.rootAppSidebar.spaces.add-tooltip']()}
        >
          <FolderIcon />
        </IconButton>
      }
    >
      <NavigationPanelTreeRoot
        placeholder={
          isLoading ? null : <RootEmpty onClickCreate={handleCreateSpace} />
        }
      >
        {spaces.map((space: Space) => (
          <NavigationPanelSpaceNode
            key={space.id}
            spaceId={space.id}
            reorderable={false}
            location={{
              at: 'navigation-panel:space:list',
            }}
            parentPath={path}
          />
        ))}
      </NavigationPanelTreeRoot>
    </CollapsibleSection>
  );
};
