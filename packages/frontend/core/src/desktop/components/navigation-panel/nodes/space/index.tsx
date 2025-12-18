import {
  type DropTargetDropEvent,
  type DropTargetOptions,
  MenuItem,
  toast,
} from '@affine/component';
import {
  type IconData,
  IconRenderer,
  IconType,
} from '@affine/component/ui/icon-picker';
import { SpaceDeleteModal } from '@affine/core/desktop/dialogs/space-setting/delete-space-modal';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { DocsService } from '@affine/core/modules/doc';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { NavigationPanelService } from '@affine/core/modules/navigation-panel';
import { type Space, SpaceService } from '@affine/core/modules/space';
import { WorkbenchService } from '@affine/core/modules/workbench';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import {
  DeleteIcon,
  FolderIcon,
  PlusIcon,
  SettingsIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService, useServices } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useCallback, useMemo, useState } from 'react';

import {
  NavigationPanelTreeNode,
  type NavigationPanelTreeNodeDropEffect,
} from '../../tree';
import type { NavigationPanelTreeNodeIcon } from '../../tree/node';
import { NavigationPanelDocNode } from '../doc';
import type { GenericNavigationPanelNode } from '../types';
import { Empty } from './empty';

const DefaultSpaceIcon: NavigationPanelTreeNodeIcon = ({
  className,
  draggedOver,
  treeInstruction,
}) => (
  <FolderIcon
    className={className}
    data-dragged-over={!!draggedOver && treeInstruction?.type === 'make-child'}
  />
);

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

// Create a custom icon component that shows the space's icon or falls back to folder
const createSpaceIconComponent = (
  icon: string | null | undefined
): NavigationPanelTreeNodeIcon => {
  if (!icon) {
    return DefaultSpaceIcon;
  }

  const iconData = parseIconData(icon);
  if (!iconData) {
    return DefaultSpaceIcon;
  }

  // Return a component that renders the icon
  const CustomSpaceIcon: NavigationPanelTreeNodeIcon = ({ className }) => (
    <span
      className={className}
      style={{
        fontSize: '1em',
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <IconRenderer data={iconData} />
    </span>
  );
  return CustomSpaceIcon;
};

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
  const {
    globalContextService,
    spaceService,
    workspaceDialogService,
    docsService,
    workbenchService,
  } = useServices({
    GlobalContextService,
    SpaceService,
    WorkspaceDialogService,
    DocsService,
    WorkbenchService,
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
  const icon = useLiveData(space?.icon$);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Create the icon component based on the space's custom icon
  const SpaceIconComponent = useMemo(
    () => createSpaceIconComponent(icon),
    [icon]
  );

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

  const handleDelete = useCallback(() => {
    if (!space) {
      return;
    }
    setShowDeleteModal(true);
  }, [space]);

  const handleConfirmDelete = useCallback(() => {
    if (!space) {
      return;
    }
    spaceService.deleteSpace(space.id).catch(console.error);
    toast(t['com.affine.space.deleted']());
    setShowDeleteModal(false);
  }, [space, spaceService, t]);

  const handleOpenSettings = useCallback(() => {
    workspaceDialogService.open('space-setting', { spaceId });
  }, [workspaceDialogService, spaceId]);

  const handleCreateNewDoc = useCallback(() => {
    if (!space) {
      return;
    }
    const newDocId = nanoid();
    // Create doc with spaceId - middleware will handle space assignment
    docsService.createDoc({
      id: newDocId,
      primaryMode: 'page',
      spaceId: space.id,
    });
    workbenchService.workbench.openDoc(newDocId);
    setCollapsed(false);
    track.$.navigationPanel.organize.createOrganizeItem({
      type: 'doc',
      control: 'button',
    });
  }, [space, docsService, workbenchService, setCollapsed]);

  const spaceOperations = useMemo(() => {
    return [
      {
        index: 0,
        view: (
          <MenuItem
            prefixIcon={<PlusIcon />}
            onClick={handleCreateNewDoc}
            data-testid="space-option-new-doc"
          >
            {t['com.affine.space.newDoc']()}
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
  }, [handleCreateNewDoc, handleOpenSettings, handleDelete, t]);

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
    <>
      <NavigationPanelTreeNode
        icon={SpaceIconComponent}
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
      <SpaceDeleteModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        spaceName={name || ''}
        onConfirm={handleConfirmDelete}
      />
    </>
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
