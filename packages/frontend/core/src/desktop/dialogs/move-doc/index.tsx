import { Button, Checkbox, Modal, notify, RadioGroup } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useMutation } from '@affine/core/components/hooks/use-mutation';
import type { DialogComponentProps } from '@affine/core/modules/dialogs';
import type { WORKSPACE_DIALOG_SCHEMA } from '@affine/core/modules/dialogs/constant';
import { DocsService } from '@affine/core/modules/doc';
import type { WorkspaceMetadata } from '@affine/core/modules/workspace';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { LinkTraversalMode, moveDocToWorkspaceMutation } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import * as styles from './styles.css';

/**
 * Component for each workspace item in the selector
 */
const WorkspaceItem = ({
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
    <button
      type="button"
      className={styles.workspaceItem}
      data-selected={selected}
      onClick={onSelect}
      aria-pressed={selected}
    >
      {name || workspace.id}
    </button>
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

  // Get all workspaces
  const workspaces = useLiveData(workspacesService.list.workspaces$);
  const currentWorkspaceId = currentWorkspace.workspace.id;
  const isSourceCloudWorkspace =
    currentWorkspace.workspace.flavour === 'affine-cloud';

  // Filter to show only other cloud workspaces (exclude current workspace)
  const targetWorkspaces = useMemo(() => {
    return workspaces.filter(
      ws => ws.id !== currentWorkspaceId && ws.flavour === 'affine-cloud'
    );
  }, [workspaces, currentWorkspaceId]);

  // State
  const [targetWorkspaceId, setTargetWorkspaceId] = useState<string>('');
  const [moveLinkedDocs, setMoveLinkedDocs] = useState(false);
  const [linkTraversalMode, setLinkTraversalMode] = useState<LinkTraversalMode>(
    LinkTraversalMode.Immediate
  );
  const [error, setError] = useState<string | null>(null);

  // Get doc title reactively
  const docRecord = useLiveData(docsService.list.doc$(docId));
  const docTitle = useLiveData(docRecord?.title$) || t['Untitled']();

  // Set default target workspace
  useEffect(() => {
    if (targetWorkspaces.length > 0 && !targetWorkspaceId) {
      setTargetWorkspaceId(targetWorkspaces[0].id);
    }
  }, [targetWorkspaces, targetWorkspaceId]);

  // Mutation
  const { trigger, isMutating } = useMutation({
    mutation: moveDocToWorkspaceMutation,
  });

  const handleMove = useAsyncCallback(async () => {
    if (!targetWorkspaceId) {
      setError(t['com.affine.moveDoc.error.selectWorkspace']());
      return;
    }

    setError(null);

    try {
      const result = await trigger({
        input: {
          sourceWorkspaceId: currentWorkspaceId,
          docId,
          targetWorkspaceId,
          moveLinkedDocs,
          linkTraversalMode,
        },
      });

      if (result.moveDocToWorkspace.success) {
        notify.success({
          title: t['com.affine.moveDoc.success'](),
        });
        close(result.moveDocToWorkspace);
      } else {
        setError(t['com.affine.moveDoc.error']());
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t['com.affine.moveDoc.error']();
      setError(message);
    }
  }, [
    targetWorkspaceId,
    currentWorkspaceId,
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
              <div className={styles.workspaceList}>
                {targetWorkspaces.map(ws => (
                  <WorkspaceItem
                    key={ws.id}
                    workspace={ws}
                    selected={targetWorkspaceId === ws.id}
                    onSelect={() => setTargetWorkspaceId(ws.id)}
                  />
                ))}
              </div>
            </div>

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
