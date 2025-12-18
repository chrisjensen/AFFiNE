import { type MenuProps } from '@affine/component';
import { usePageHelper } from '@affine/core/blocksuite/block-suite-page-list/utils';
import { ExplorerDisplayMenuButton } from '@affine/core/components/explorer/display-menu';
import { ViewToggle } from '@affine/core/components/explorer/display-menu/view-toggle';
import type { DocListItemView } from '@affine/core/components/explorer/docs-view/doc-list-item';
import { ExplorerNavigation } from '@affine/core/components/explorer/header/navigation';
import type { ExplorerDisplayPreference } from '@affine/core/components/explorer/types';
import { PageListNewPageButton } from '@affine/core/components/page-list/docs/page-list-new-page-button';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { DocsService } from '@affine/core/modules/doc';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { inferOpenMode } from '@affine/core/utils';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { useService, useServices } from '@toeverything/infra';
import type { MouseEvent } from 'react';
import { useCallback } from 'react';

import * as styles from './header.css';

const menuProps: Partial<MenuProps> = {
  contentOptions: {
    side: 'bottom',
    align: 'end',
    alignOffset: 0,
    sideOffset: 8,
  },
};

export const SpaceDetailHeader = ({
  displayPreference,
  onDisplayPreferenceChange,
  view,
  onViewChange,
  spaceId,
}: {
  displayPreference: ExplorerDisplayPreference;
  onDisplayPreferenceChange: (
    displayPreference: ExplorerDisplayPreference
  ) => void;
  view?: DocListItemView;
  onViewChange?: (view: DocListItemView) => void;
  spaceId: string;
}) => {
  const t = useI18n();
  const workspaceService = useService(WorkspaceService);
  const workspaceDialogService = useService(WorkspaceDialogService);
  const workbenchService = useService(WorkbenchService);
  const { docsService } = useServices({
    DocsService,
  });
  const workbench = workbenchService.workbench;
  const { createEdgeless, createPage } = usePageHelper(
    workspaceService.workspace.docCollection
  );

  // Create page helpers that always include the spaceId
  // The middleware will pick up spaceId from globalContext, but we pass it explicitly
  // to ensure it's set correctly
  const createPageInSpace = useCallback(
    (
      mode?: 'page' | 'edgeless',
      options?: {
        at?: 'new-tab' | 'tail' | 'active';
        show?: boolean;
      }
    ) => {
      const page = docsService.createDoc({
        spaceId: spaceId,
        primaryMode: mode === 'edgeless' ? 'edgeless' : 'page',
      });
      if (options?.show !== false) {
        workbench.openDoc(page.id, {
          at: options?.at ?? 'active',
          show: options?.show ?? true,
        });
      }
      return page;
    },
    [docsService, spaceId, workbench]
  );

  const createEdgelessInSpace = useCallback(
    (e?: MouseEvent) => {
      return createPageInSpace('edgeless', { at: inferOpenMode(e) });
    },
    [createPageInSpace]
  );

  const createDocInSpace = useCallback(
    (e?: MouseEvent) => {
      return createPageInSpace('page', { at: inferOpenMode(e) });
    },
    [createPageInSpace]
  );

  const handleOpenDocs = useCallback(
    (result: {
      docIds: string[];
      entryId?: string;
      isWorkspaceFile?: boolean;
    }) => {
      const { docIds, entryId, isWorkspaceFile } = result;
      // If the imported file is a workspace file, open the entry page.
      if (isWorkspaceFile && entryId) {
        workbench.openDoc(entryId);
      } else if (!docIds.length) {
        return;
      }
      // Open all the docs when there are multiple docs imported.
      if (docIds.length > 1) {
        workbench.openAll();
      } else {
        // Otherwise, open the only doc.
        workbench.openDoc(docIds[0]);
      }
    },
    [workbench]
  );

  const onImportFile = useCallback(() => {
    track.$.header.importModal.open();
    workspaceDialogService.open('import', undefined, payload => {
      if (!payload) {
        return;
      }
      handleOpenDocs(payload);
    });
  }, [workspaceDialogService, handleOpenDocs]);

  return (
    <div className={styles.header}>
      <ExplorerNavigation active="docs" />

      <div className={styles.actions}>
        {view !== undefined && onViewChange && (
          <ViewToggle view={view} onViewChange={onViewChange} />
        )}
        <ExplorerDisplayMenuButton
          menuProps={menuProps}
          displayPreference={displayPreference}
          onDisplayPreferenceChange={onDisplayPreferenceChange}
        />
        <PageListNewPageButton
          size="small"
          onCreateEdgeless={e =>
            createEdgelessInSpace({ at: inferOpenMode(e) })
          }
          onCreatePage={e => createDocInSpace({ at: inferOpenMode(e) })}
          onCreateDoc={e => createDocInSpace({ at: inferOpenMode(e) })}
          onImportFile={onImportFile}
          data-testid="new-page-button-trigger"
        >
          <span className={styles.newPageButtonLabel}>{t['New Page']()}</span>
        </PageListNewPageButton>
      </div>
    </div>
  );
};
