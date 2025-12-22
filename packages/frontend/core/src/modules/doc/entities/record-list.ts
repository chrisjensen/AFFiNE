import type { DocMode } from '@blocksuite/affine/model';
import { Entity, LiveData } from '@toeverything/infra';
import { combineLatest, map, of, switchMap } from 'rxjs';

import type { SpaceService } from '../../space/services/space';
import type { DocsStore } from '../stores/docs';
import { DocRecord } from './record';

export class DocRecordList extends Entity {
  constructor(
    private readonly store: DocsStore,
    private readonly spaceService: SpaceService
  ) {
    super();
  }

  private readonly pool = new Map<string, DocRecord>();

  public readonly docsMap$ = LiveData.from<Map<string, DocRecord>>(
    combineLatest([
      // Workspace root doc IDs from Yjs meta.pages
      this.store.watchDocIds(),
      // Space doc IDs from all accessible spaces
      this.spaceService.spacesList$.pipe(
        switchMap(spaces =>
          spaces.length === 0
            ? of([] as string[])
            : combineLatest(spaces.map(s => s.docIds$)).pipe(
                map(arrays => arrays.flat())
              )
        )
      ),
      // Hidden doc IDs (docs in inaccessible spaces)
      this.spaceService.hiddenDocIds$,
    ]).pipe(
      map(([workspaceDocIds, spaceDocIds, hiddenDocIds]) => {
        const hiddenSet = new Set(hiddenDocIds);
        // Combine and deduplicate doc IDs
        const allIds = [...new Set([...workspaceDocIds, ...spaceDocIds])];
        // Filter out hidden docs
        const visibleIds = allIds.filter(id => !hiddenSet.has(id));
        return new Map(
          visibleIds.map(id => {
            const exists = this.pool.get(id);
            if (exists) {
              return [id, exists];
            }
            const record = this.framework.createEntity(DocRecord, { id });
            this.pool.set(id, record);
            return [id, record];
          })
        );
      })
    ),
    new Map()
  );

  public readonly docs$ = this.docsMap$.selector(d => Array.from(d.values()));

  public readonly trashDocs$ = LiveData.from<DocRecord[]>(
    this.store.watchTrashDocIds().pipe(
      map(ids =>
        ids.map(id => {
          const exists = this.pool.get(id);
          if (exists) {
            return exists;
          }
          const record = this.framework.createEntity(DocRecord, { id });
          this.pool.set(id, record);
          return record;
        })
      )
    ),
    []
  );

  public readonly nonTrashDocsIds$ = LiveData.from<string[]>(
    this.store.watchNonTrashDocIds(),
    []
  );

  public readonly isReady$ = LiveData.from(
    this.store.watchDocListReady(),
    false
  );

  public doc$(id: string) {
    return this.docsMap$.selector(map => map.get(id));
  }

  public setPrimaryMode(id: string, mode: DocMode) {
    return this.store.setDocPrimaryModeSetting(id, mode);
  }

  public getPrimaryMode(id: string) {
    return this.store.getDocPrimaryModeSetting(id);
  }

  public togglePrimaryMode(id: string) {
    const mode = (
      this.getPrimaryMode(id) === 'edgeless' ? 'page' : 'edgeless'
    ) as DocMode;
    this.setPrimaryMode(id, mode);
    return this.getPrimaryMode(id);
  }

  public primaryMode$(id: string) {
    return LiveData.from(
      this.store.watchDocPrimaryModeSetting(id),
      this.getPrimaryMode(id)
    );
  }
}
