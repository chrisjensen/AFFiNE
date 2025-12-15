import {
  type DropTargetDropEvent,
  type DropTargetOptions,
  MenuItem,
  toast,
} from '@affine/component';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { NavigationPanelService } from '@affine/core/modules/navigation-panel';
import { type Space, SpaceService } from '@affine/core/modules/space';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import {
  DeleteIcon,
  EditIcon,
  FolderIcon,
  SettingsIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService, useServices } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import {
  NavigationPanelTreeNode,
  type NavigationPanelTreeNodeDropEffect,
} from '../../tree';
import type { NavigationPanelTreeNodeIcon } from '../../tree/node';
import { NavigationPanelDocNode } from '../doc';
import type { GenericNavigationPanelNode } from '../types';
import { Empty } from './empty';

const SpaceIcon: NavigationPanelTreeNodeIcon = ({
  className,
  draggedOver,
  treeInstruction,
}) => (
  <FolderIcon
    className={className}
    data-dragged-over={!!draggedOver && treeInstruction?.type === 'make-child'}
  />
);

export const NavigationPanelSpaceNode = ({
  spaceId,
  onDrop,
  location,
  reorderable,
  operations: additionalOperations,
  canDrop,
  dropEffect,
  parentPath,
}: {
  spaceId: string;
} & GenericNavigationPanelNode) => {
  const t = useI18n();
  const { globalContextService, spaceService, workspaceDialogService } =
    useServices({
      GlobalContextService,
      SpaceService,
      WorkspaceDialogService,
    });
  const navigationPanelService = useService(NavigationPanelService);

  const active =
    useLiveData(globalContextService.globalContext.spaceId.$) === spaceId;

  const path = useMemo(
    () => [...(parentPath ?? []), `space-${spaceId}`],
    [parentPath, spaceId]
  );

  const collapsed = useLiveData(navigationPanelService.collapsed$(path));
  const setCollapsed = useCallback(
    (value: boolean) => {
      navigationPanelService.setCollapsed(path, value);
    },
    [navigationPanelService, path]
  );

  const space = useLiveData(spaceService.space$(spaceId));
  const name = useLiveData(space?.name$);

  const dndData = useMemo(() => {
    return {
      draggable: {
        entity: {
          type: 'space',
          id: spaceId,
        },
        from: location,
      },
      dropTarget: {
        at: 'navigation-panel:space',
      },
    } satisfies AffineDNDData;
  }, [spaceId, location]);

  const handleRename = useCallback(
    (newName: string) => {
      if (space && space.name$.value !== newName) {
        space.rename(newName).catch(console.error);
        toast(t['com.affine.toastMessage.rename']());
      }
    },
    [space, t]
  );

  const handleMoveDocToSpace = useCallback(
    (docId: string) => {
      if (!space) {
        return;
      }
      spaceService.moveDocToSpace(docId, space.id).catch(console.error);
      toast(t['com.affine.space.docMoved']());
    },
    [space, spaceService, t]
  );

  const handleDropOnSpace = useCallback(
    (data: DropTargetDropEvent<AffineDNDData>) => {
      if (space && data.treeInstruction?.type === 'make-child') {
        if (data.source.data.entity?.type === 'doc') {
          handleMoveDocToSpace(data.source.data.entity.id);
          track.$.navigationPanel.organize.createOrganizeItem({
            type: 'link',
            target: 'doc',
            control: 'drag',
          });
        }
      } else {
        onDrop?.(data);
      }
    },
    [space, onDrop, handleMoveDocToSpace]
  );

  const handleDropEffectOnSpace =
    useCallback<NavigationPanelTreeNodeDropEffect>(
      data => {
        if (space && data.treeInstruction?.type === 'make-child') {
          if (data.source.data.entity?.type === 'doc') {
            return 'move';
          }
        } else {
          return dropEffect?.(data);
        }
        return;
      },
      [space, dropEffect]
    );

  const handleDropOnPlaceholder = useCallback(
    (data: DropTargetDropEvent<AffineDNDData>) => {
      if (space && data.source.data.entity?.type === 'doc') {
        handleMoveDocToSpace(data.source.data.entity.id);
        track.$.navigationPanel.organize.createOrganizeItem({
          type: 'link',
          target: 'doc',
          control: 'drag',
        });
      }
    },
    [space, handleMoveDocToSpace]
  );

  const handleOpenCollapsed = useCallback(() => {
    setCollapsed(false);
  }, [setCollapsed]);

  const handleDelete = useCallback(() => {
    if (!space) {
      return;
    }
    spaceService.deleteSpace(space.id).catch(console.error);
    toast(t['com.affine.space.deleted']());
  }, [space, spaceService, t]);

  const handleOpenSettings = useCallback(() => {
    workspaceDialogService.open('space-setting', { spaceId });
  }, [workspaceDialogService, spaceId]);

  const spaceOperations = useMemo(() => {
    return [
      {
        index: 0,
        view: (
          <MenuItem
            prefixIcon={<EditIcon />}
            onClick={handleOpenCollapsed}
            data-testid="space-option-rename"
          >
            {t['Rename']()}
          </MenuItem>
        ),
      },
      {
        index: 10,
        view: (
          <MenuItem
            prefixIcon={<SettingsIcon />}
            onClick={handleOpenSettings}
            data-testid="space-option-settings"
          >
            {t['com.affine.space.settings']()}
          </MenuItem>
        ),
      },
      {
        index: 99,
        view: (
          <MenuItem
            type="danger"
            prefixIcon={<DeleteIcon />}
            onClick={handleDelete}
            data-testid="space-option-delete"
          >
            {t['Delete']()}
          </MenuItem>
        ),
      },
    ];
  }, [handleOpenCollapsed, handleOpenSettings, handleDelete, t]);

  const finalOperations = useMemo(() => {
    if (additionalOperations) {
      return [...additionalOperations, ...spaceOperations];
    }
    return spaceOperations;
  }, [spaceOperations, additionalOperations]);

  const handleCanDrop = useMemo<DropTargetOptions<AffineDNDData>['canDrop']>(
    () => args => {
      const entityType = args.source.data.entity?.type;
      return args.treeInstruction?.type !== 'make-child'
        ? ((typeof canDrop === 'function' ? canDrop(args) : canDrop) ?? true)
        : entityType === 'doc';
    },
    [canDrop]
  );

  if (!space) {
    return null;
  }

  return (
    <NavigationPanelTreeNode
      icon={SpaceIcon}
      name={name || t['Untitled']()}
      dndData={dndData}
      onDrop={handleDropOnSpace}
      renameable
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      to={`/space/${space.id}`}
      active={active}
      canDrop={handleCanDrop}
      reorderable={reorderable}
      onRename={handleRename}
      childrenPlaceholder={<Empty onDrop={handleDropOnPlaceholder} />}
      operations={finalOperations}
      dropEffect={handleDropEffectOnSpace}
      data-testid={`navigation-panel-space-${spaceId}`}
      explorerIconConfig={{
        where: 'space',
        id: spaceId,
      }}
    >
      <NavigationPanelSpaceNodeChildren space={space} path={path} />
    </NavigationPanelTreeNode>
  );
};

const NavigationPanelSpaceNodeChildren = ({
  space,
  path,
}: {
  space: Space;
  path: string[];
}) => {
  const t = useI18n();
  const { spaceService } = useServices({
    SpaceService,
  });

  // Use real doc IDs from the space entity
  const docIds = useLiveData(space.docIds$) ?? [];

  const handleRemoveFromSpace = useCallback(
    (docId: string) => {
      spaceService.moveDocToSpace(docId, null).catch(console.error);
      toast(t['com.affine.space.docRemoved']());
    },
    [spaceService, t]
  );

  return docIds.map(docId => (
    <NavigationPanelDocNode
      key={docId}
      docId={docId}
      reorderable={false}
      location={{
        at: 'navigation-panel:space:docs',
        spaceId: space.id,
      }}
      parentPath={path}
      operations={[
        {
          index: 99,
          view: (
            <MenuItem
              prefixIcon={<FolderIcon />}
              onClick={() => handleRemoveFromSpace(docId)}
            >
              {t['com.affine.space.removeDoc']()}
            </MenuItem>
          ),
        },
      ]}
    />
  ));
};
