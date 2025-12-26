import {
  Button,
  Checkbox,
  Menu,
  MenuItem,
  Modal,
  notify,
  RadioGroup,
} from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useMutation } from '@affine/core/components/hooks/use-mutation';
import type { DialogComponentProps } from '@affine/core/modules/dialogs';
import type { WORKSPACE_DIALOG_SCHEMA } from '@affine/core/modules/dialogs/constant';
import { DocsService } from '@affine/core/modules/doc';
import type { Space } from '@affine/core/modules/space';
import { SpaceService } from '@affine/core/modules/space';
import type { WorkspaceMetadata } from '@affine/core/modules/workspace';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { LinkTraversalMode, moveDocToWorkspaceMutation } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { FolderIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import * as styles from './styles.css';

/**
 * Component for each workspace item in the dropdown
 */
const WorkspaceMenuItem = ({
  workspace,
  selected,
  onSelect,
}: {
  workspace: WorkspaceMetadata;
  selected: boolean;
  onSelect: () => void;
}) => {
  const workspacesService = useService(WorkspacesService);
  const profile = workspacesService.getProfile(workspace);
  const name = useLiveData(profile.name$);

  return (
    <MenuItem onSelect={onSelect} selected={selected}>
      {name || workspace.id}
    </MenuItem>
  );
};

/**
 * Component for each space item in the dropdown
 */
const SpaceMenuItem = ({
  space,
  selected,
  onSelect,
}: {
  space: Space;
  selected: boolean;
  onSelect: () => void;
}) => {
  const name = useLiveData(space.name$);

  return (
    <MenuItem
      onSelect={onSelect}
      selected={selected}
      prefixIcon={<FolderIcon />}
    >
      {name || space.id}
    </MenuItem>
  );
};

export const MoveDocDialog = ({
  close,
  docId,
}: DialogComponentProps<WORKSPACE_DIALOG_SCHEMA['move-doc']>) => {
  const t = useI18n();
  const workspacesService = useService(WorkspacesService);
  const currentWorkspace = useService(WorkspaceService);
  const docsService = useService(DocsService);
  const spaceService = useService(SpaceService);

  // Get all workspaces
  const workspaces = useLiveData(workspacesService.list.workspaces$);
  const currentWorkspaceId = currentWorkspace.workspace.id;
  const isSourceCloudWorkspace =
    currentWorkspace.workspace.flavour === 'affine-cloud';

  // Filter to show only cloud workspaces (include current workspace for moving to different space)
  const targetWorkspaces = useMemo(() => {
    return workspaces.filter(ws => ws.flavour === 'affine-cloud');
  }, [workspaces]);

  // Get spaces for the current workspace (space selector only works for same workspace)
  const spaces = useLiveData(spaceService.spacesList$);
  const currentSpaceId = spaceService.getSpaceIdForDoc(docId);

  // Load spaces on mount
  useEffect(() => {
    spaceService.loadSpaces().catch(console.error);
  }, [spaceService]);

  // State - default to current workspace and current space
  const [targetWorkspaceId, setTargetWorkspaceId] =
    useState<string>(currentWorkspaceId);
  const [targetSpaceId, setTargetSpaceId] = useState<string | null>(
    currentSpaceId
  );
  const [moveLinkedDocs, setMoveLinkedDocs] = useState(false);
  const [linkTraversalMode, setLinkTraversalMode] = useState<LinkTraversalMode>(
    LinkTraversalMode.Immediate
  );
  const [error, setError] = useState<string | null>(null);

  // Whether space selector should be shown (only for same workspace moves)
  const showSpaceSelector = targetWorkspaceId === currentWorkspaceId;

  // Get the selected workspace for display
  const selectedWorkspace = targetWorkspaces.find(
    w => w.id === targetWorkspaceId
  );
  const selectedWorkspaceProfile = selectedWorkspace
    ? workspacesService.getProfile(selectedWorkspace)
    : null;
  const selectedWorkspaceName = useLiveData(selectedWorkspaceProfile?.name$);

  // Get the selected space for display
  const selectedSpace = spaces.find(s => s.id === targetSpaceId);
  const selectedSpaceName = useLiveData(selectedSpace?.name$);

  // Get doc title reactively
  const docRecord = useLiveData(docsService.list.doc$(docId));
  const docTitle = useLiveData(docRecord?.title$) || t['Untitled']();

  // Mutation
  const { trigger, isMutating } = useMutation({
    mutation: moveDocToWorkspaceMutation,
  });

  const handleMove = useAsyncCallback(async () => {
    if (!targetWorkspaceId) {
      setError(t['com.affine.moveDoc.error.selectWorkspace']());
      return;
    }

    // Validate that something is actually changing
    const isSameLocation =
      targetWorkspaceId === currentWorkspaceId &&
      targetSpaceId === currentSpaceId;
    if (isSameLocation) {
      setError(t['com.affine.moveDoc.error.sameLocation']());
      return;
    }

    setError(null);

    try {
      const result = await trigger({
        input: {
          sourceWorkspaceId: currentWorkspaceId,
          docId,
          targetWorkspaceId,
          targetSpaceId: showSpaceSelector ? targetSpaceId : null,
          moveLinkedDocs,
          linkTraversalMode,
        },
      });

      if (result.moveDocToWorkspace.success) {
        // Trigger workspace root doc refresh to pick up changes immediately
        // This works for both websocket (CloudDocStorage) and HTTP (StaticCloudDocStorage) clients
        try {
          const workspaceRootDocId = currentWorkspaceId;
          // Force sync engine to check for workspace root doc updates
          await currentWorkspace.engine.doc.waitForSynced(workspaceRootDocId);
        } catch (err) {
          // Log but don't fail the move operation if refresh fails
          console.warn('Failed to refresh workspace root doc after move:', err);
        }

        notify.success({
          title: t['com.affine.moveDoc.success'](),
        });
        close(result.moveDocToWorkspace);
      } else {
        setError(t['com.affine.moveDoc.error']());
      }
    } catch (err) {
      // Map specific error types to localized messages
      let message: string;
      const errorMessage = err instanceof Error ? err.message : '';

      if (errorMessage.includes('in trash')) {
        message = t['com.affine.moveDoc.error.inTrash']();
      } else if (
        errorMessage.includes('permission') &&
        errorMessage.includes('CreateDoc')
      ) {
        message = t['com.affine.moveDoc.error.targetPermission']();
      } else if (
        errorMessage.includes('permission') ||
        errorMessage.includes('denied')
      ) {
        message = t['com.affine.moveDoc.error.permission']();
      } else if (errorMessage) {
        message = errorMessage;
      } else {
        message = t['com.affine.moveDoc.error']();
      }

      setError(message);
    }
  }, [
    targetWorkspaceId,
    currentWorkspaceId,
    targetSpaceId,
    currentSpaceId,
    showSpaceSelector,
    docId,
    moveLinkedDocs,
    linkTraversalMode,
    trigger,
    close,
    t,
  ]);

  const handleCancel = useCallback(() => {
    close(undefined);
  }, [close]);

  const linkModeOptions = useMemo(
    () => [
      {
        value: LinkTraversalMode.Immediate,
        label: t['com.affine.moveDoc.linkMode.immediate'](),
      },
      {
        value: LinkTraversalMode.Nested,
        label: t['com.affine.moveDoc.linkMode.nested'](),
      },
    ],
    [t]
  );

  if (!docId) return null;

  const hasNoTargetWorkspaces = targetWorkspaces.length === 0;

  return (
    <Modal
      open
      onOpenChange={() => close(undefined)}
      contentOptions={{
        className: styles.modal,
      }}
      withoutCloseButton
    >
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.title}>{t['com.affine.moveDoc.title']()}</div>
          <div className={styles.docTitle}>{docTitle}</div>
        </div>

        {!isSourceCloudWorkspace ? (
          <div className={styles.errorMessage}>
            {t['com.affine.moveDoc.error.localWorkspace']()}
          </div>
        ) : hasNoTargetWorkspaces ? (
          <div className={styles.errorMessage}>
            {t['com.affine.moveDoc.error.noWorkspaces']()}
          </div>
        ) : (
          <div className={styles.formSection}>
            <div>
              <div className={styles.fieldLabel}>
                {t['com.affine.moveDoc.targetWorkspace']()}
              </div>
              <Menu
                items={
                  <>
                    {targetWorkspaces.map(ws => (
                      <WorkspaceMenuItem
                        key={ws.id}
                        workspace={ws}
                        selected={targetWorkspaceId === ws.id}
                        onSelect={() => setTargetWorkspaceId(ws.id)}
                      />
                    ))}
                  </>
                }
                contentOptions={{
                  align: 'start',
                }}
              >
                <Button
                  variant="secondary"
                  className={styles.workspaceSelectButton}
                >
                  {selectedWorkspaceName || t['Untitled']()}
                </Button>
              </Menu>
            </div>

            {showSpaceSelector && (
              <div className={styles.spaceSelectSection}>
                <div className={styles.fieldLabel}>
                  {t['com.affine.moveDoc.targetSpace']()}
                </div>
                <Menu
                  items={
                    <>
                      <MenuItem
                        prefixIcon={<FolderIcon />}
                        onSelect={() => setTargetSpaceId(null)}
                        selected={targetSpaceId === null}
                      >
                        {t['com.affine.space.workspaceRoot']?.() ||
                          'Workspace Root'}
                      </MenuItem>
                      {spaces.map(space => (
                        <SpaceMenuItem
                          key={space.id}
                          space={space}
                          selected={targetSpaceId === space.id}
                          onSelect={() => setTargetSpaceId(space.id)}
                        />
                      ))}
                    </>
                  }
                  contentOptions={{
                    align: 'start',
                  }}
                >
                  <Button
                    variant="secondary"
                    className={styles.spaceSelectButton}
                  >
                    {targetSpaceId === null
                      ? t['com.affine.space.workspaceRoot']?.() ||
                        'Workspace Root'
                      : selectedSpaceName || t['Untitled']()}
                  </Button>
                </Menu>
              </div>
            )}

            <div className={styles.linkedDocsSection}>
              <label className={styles.checkbox}>
                <Checkbox
                  checked={moveLinkedDocs}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setMoveLinkedDocs(e.target.checked)
                  }
                />
                <span className={styles.checkboxLabel}>
                  {t['com.affine.moveDoc.moveLinkedDocs']()}
                </span>
              </label>

              {moveLinkedDocs && (
                <div className={styles.linkModeSelect}>
                  <RadioGroup
                    value={linkTraversalMode}
                    onChange={(value: string) =>
                      setLinkTraversalMode(value as LinkTraversalMode)
                    }
                    items={linkModeOptions}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {error && <div className={styles.errorMessage}>{error}</div>}

        <div className={styles.actions}>
          <Button onClick={handleCancel} disabled={isMutating}>
            {t['Cancel']()}
          </Button>
          <Button
            variant="primary"
            onClick={handleMove}
            disabled={
              isMutating || !isSourceCloudWorkspace || hasNoTargetWorkspaces
            }
            loading={isMutating}
          >
            {t['com.affine.moveDoc.move']()}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
