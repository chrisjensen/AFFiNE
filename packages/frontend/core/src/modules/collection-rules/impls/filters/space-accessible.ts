import type { DocsService } from '@affine/core/modules/doc';
import type { SpaceService } from '@affine/core/modules/space';
import { Service } from '@toeverything/infra';
import { combineLatest, map, type Observable } from 'rxjs';

import type { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';

/**
 * System filter for filtering out docs in inaccessible spaces.
 * Used with key: 'space-accessible'
 *
 * When value is 'true' (default), returns only docs the user can access.
 * When value is 'false', returns only hidden docs (in inaccessible spaces).
 */
export class SpaceAccessibleFilterProvider
  extends Service
  implements FilterProvider
{
  constructor(
    private readonly docsService: DocsService,
    private readonly spaceService: SpaceService
  ) {
    super();
  }

  filter$(params: FilterParams): Observable<Set<string>> {
    const showAccessible = params.value !== 'false';

    return combineLatest([
      this.docsService.allDocIds$(),
      this.spaceService.hiddenDocIds$,
    ]).pipe(
      map(([allDocIds, hiddenDocIds]) => {
        const hiddenSet = new Set(hiddenDocIds);

        if (showAccessible) {
          // Return only accessible docs (not in hidden list)
          return new Set(allDocIds.filter(id => !hiddenSet.has(id)));
        } else {
          // Return only hidden docs
          return new Set(allDocIds.filter(id => hiddenSet.has(id)));
        }
      })
    );
  }
}
