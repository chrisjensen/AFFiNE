import type { DocsService } from '@affine/core/modules/doc';
import type { SpaceService } from '@affine/core/modules/space';
import { Service } from '@toeverything/infra';
import { combineLatest, map, type Observable, of, switchMap } from 'rxjs';

import type { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';

export class SpaceFilterProvider extends Service implements FilterProvider {
  constructor(
    private readonly spaceService: SpaceService,
    private readonly docsService: DocsService
  ) {
    super();
  }

  filter$(params: FilterParams): Observable<Set<string>> {
    const method = params.method;
    const spaceIds = params.value?.split(',').filter(Boolean) ?? [];

    if (method === 'is' || method === 'is-not') {
      // Filter by specific space(s)
      if (spaceIds.length === 0) {
        return of(new Set<string>());
      }

      const spaces$ = this.spaceService.spaces$;

      const docIdsInSpaces$ = spaces$.pipe(
        switchMap(spacesMap => {
          const selectedSpaces = spaceIds
            .map(id => spacesMap.get(id))
            .filter((space): space is NonNullable<typeof space> => !!space);

          if (selectedSpaces.length === 0) {
            return of(new Set<string>());
          }

          return combineLatest(selectedSpaces.map(space => space.docIds$)).pipe(
            map(docIdArrays => new Set(docIdArrays.flat()))
          );
        })
      );

      if (method === 'is') {
        return docIdsInSpaces$;
      } else {
        // is-not: return all docs NOT in the selected spaces
        return combineLatest([
          this.docsService.allDocIds$(),
          docIdsInSpaces$,
        ]).pipe(
          map(
            ([allDocIds, docsInSpaces]) =>
              new Set(allDocIds.filter(id => !docsInSpaces.has(id)))
          )
        );
      }
    } else if (method === 'is-not-empty') {
      // Docs that are in ANY space
      return this.spaceService.spaces$.pipe(
        switchMap(spacesMap => {
          const spaces = Array.from(spacesMap.values());
          if (spaces.length === 0) {
            return of(new Set<string>());
          }

          return combineLatest(spaces.map(space => space.docIds$)).pipe(
            map(docIdArrays => new Set(docIdArrays.flat()))
          );
        })
      );
    } else if (method === 'is-empty') {
      // Docs that are NOT in any space (in workspace root)
      return this.spaceService.spaces$.pipe(
        switchMap(spacesMap => {
          const spaces = Array.from(spacesMap.values());
          if (spaces.length === 0) {
            // No spaces exist, so all docs are "in workspace root"
            return this.docsService
              .allDocIds$()
              .pipe(map(docIds => new Set(docIds)));
          }

          return combineLatest([
            this.docsService.allDocIds$(),
            combineLatest(spaces.map(space => space.docIds$)).pipe(
              map(docIdArrays => new Set(docIdArrays.flat()))
            ),
          ]).pipe(
            map(
              ([allDocIds, docsInSpaces]) =>
                new Set(allDocIds.filter(id => !docsInSpaces.has(id)))
            )
          );
        })
      );
    }

    throw new Error(`Unsupported method: ${method}`);
  }
}
