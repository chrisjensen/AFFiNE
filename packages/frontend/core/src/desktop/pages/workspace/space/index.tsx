import {
  createDocExplorerContext,
  DocExplorerContext,
} from '@affine/core/components/explorer/context';
import { DocsExplorer } from '@affine/core/components/explorer/docs-view/docs-list';
import type { ExplorerDisplayPreference } from '@affine/core/components/explorer/types';
import { CollectionRulesService } from '@affine/core/modules/collection-rules';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { SpaceService } from '@affine/core/modules/space';
import {
  useIsActiveView,
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
} from '@affine/core/modules/workbench';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { PageNotFound } from '../../404';
import { AllDocSidebarTabs } from '../layouts/all-doc-sidebar-tabs';
import { EmptyPageList } from '../page-list-empty';
import { SpaceDetailHeader } from './header';
import * as styles from './index.css';
import { SpaceListHeader } from './list-header';

export const SpaceDetail = ({ spaceId }: { spaceId?: string }) => {
  const [explorerContextValue] = useState(createDocExplorerContext);
  const collectionRulesService = useService(CollectionRulesService);
  const globalContext = useService(GlobalContextService).globalContext;
  const permissionService = useService(WorkspacePermissionService);
  const isAdmin = useLiveData(permissionService.permission.isAdmin$);
  const isOwner = useLiveData(permissionService.permission.isOwner$);

  const spaceService = useService(SpaceService);
  const currentSpace = useLiveData(
    spaceId ? spaceService.space$(spaceId) : null
  );

  const displayPreference = useLiveData(
    explorerContextValue.displayPreference$
  );
  const groupBy = useLiveData(explorerContextValue.groupBy$);
  const orderBy = useLiveData(explorerContextValue.orderBy$);
  const groups = useLiveData(explorerContextValue.groups$);

  const isEmpty =
    groups.length === 0 ||
    (groups.length && groups.every(group => group.items.length === 0));

  const isActiveView = useIsActiveView();
  const spaceName = useLiveData(currentSpace?.name$);

  useEffect(() => {
    if (isActiveView && currentSpace && spaceId) {
      globalContext.spaceId.set(spaceId);
      globalContext.isSpace.set(true);

      return () => {
        globalContext.spaceId.set(null);
        globalContext.isSpace.set(false);
      };
    }
    return;
  }, [currentSpace, globalContext, isActiveView, spaceId]);

  useEffect(() => {
    if (!spaceId) {
      return;
    }

    const subscription = collectionRulesService
      .watch({
        filters: [
          {
            type: 'system',
            key: 'empty-journal',
            method: 'is',
            value: 'false',
          },
          {
            type: 'system',
            key: 'trash',
            method: 'is',
            value: 'false',
          },
          {
            type: 'system',
            key: 'space',
            method: 'is',
            value: spaceId,
          },
        ],
        groupBy,
        orderBy,
      })
      .subscribe({
        next: result => {
          explorerContextValue.groups$.next(result.groups);
        },
        error: error => {
          console.error(error);
        },
      });
    return () => {
      subscription.unsubscribe();
    };
  }, [
    collectionRulesService,
    explorerContextValue.groups$,
    groupBy,
    orderBy,
    spaceId,
  ]);

  const handleDisplayPreferenceChange = useCallback(
    (displayPreference: ExplorerDisplayPreference) => {
      explorerContextValue.displayPreference$.next(displayPreference);
    },
    [explorerContextValue]
  );

  if (!currentSpace || !spaceId) {
    return <PageNotFound />;
  }

  return (
    <DocExplorerContext.Provider value={explorerContextValue}>
      <ViewTitle title={spaceName ?? 'Untitled'} />
      <ViewIcon icon="collection" />
      <ViewHeader>
        <SpaceDetailHeader
          displayPreference={displayPreference}
          onDisplayPreferenceChange={handleDisplayPreferenceChange}
          spaceId={spaceId}
        />
      </ViewHeader>
      <ViewBody>
        <div className={styles.body}>
          <SpaceListHeader space={currentSpace} />
          <div className={styles.scrollArea}>
            {isEmpty ? (
              <EmptyPageList type="all" />
            ) : (
              <DocsExplorer disableMultiDelete={!isAdmin && !isOwner} />
            )}
          </div>
        </div>
      </ViewBody>
    </DocExplorerContext.Provider>
  );
};

export const Component = () => {
  const params = useParams();

  return (
    <>
      <AllDocSidebarTabs />
      <SpaceDetail spaceId={params.spaceId} />
    </>
  );
};
