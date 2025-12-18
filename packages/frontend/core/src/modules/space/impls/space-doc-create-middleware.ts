import { Service } from '@toeverything/infra';

import type {
  DocCreateMiddleware,
  DocRecord,
} from '../../doc/providers/doc-create-middleware';
import type { DocCreateOptions } from '../../doc/types';
import { GlobalContextService } from '../../global-context';
import { WorkbenchService } from '../../workbench';
import { SpaceService } from '../services/space';

/**
 * Middleware that automatically assigns documents to spaces based on context.
 * If spaceId is already provided in options, it will be preserved.
 * Otherwise, it attempts to determine the space from the current document context.
 *
 * Note: This middleware only applies to documents created via DocsService.createDoc().
 * Documents created directly via BlockSuite's workspace.createDoc() or createDefaultDoc()
 * (e.g., in slash commands or AI chat actions) will not automatically get space assignment
 * unless they go through DocsService.createDoc() with appropriate options.
 */
export class SpaceDocCreateMiddleware
  extends Service
  implements DocCreateMiddleware
{
  constructor(
    private readonly spaceService: SpaceService,
    private readonly globalContextService: GlobalContextService,
    private readonly workbenchService: WorkbenchService
  ) {
    super();
  }

  private getCurrentDocId(): string | null {
    // First try to get from GlobalContextService
    const docId = this.globalContextService.globalContext.docId.get();
    if (docId) {
      return docId;
    }

    // Fallback: try to extract from workbench location
    // Document pages have paths like /{docId} or /{docId}/...
    const location = this.workbenchService.workbench.location$.value;
    if (location) {
      const match = location.pathname.match(/^\/([^\/]+)/);
      if (match && match[1]) {
        const potentialDocId = match[1];
        // Check if it's not a known non-doc route
        const nonDocRoutes = [
          'all',
          'collection',
          'tag',
          'trash',
          'space',
          'journals',
        ];
        if (!nonDocRoutes.includes(potentialDocId)) {
          return potentialDocId;
        }
      }
    }

    return null;
  }

  beforeCreate(docCreateOptions: DocCreateOptions): DocCreateOptions {
    // If spaceId is already explicitly set, don't override it
    if (docCreateOptions.spaceId !== undefined) {
      return docCreateOptions;
    }

    // Clone to avoid mutating the original
    const options = { ...docCreateOptions };

    // Try to get space from sourceDocId if provided (for template duplication, etc.)
    if (options.sourceDocId) {
      const spaceId = this.spaceService.getSpaceIdForDoc(options.sourceDocId);
      if (spaceId) {
        options.spaceId = spaceId;
      }
      return options;
    }

    // Try to get space from currentDocId if provided (for linked docs, etc.)
    // or from current context (GlobalContextService or workbench location)
    const currentDocId = options.currentDocId ?? this.getCurrentDocId();
    if (currentDocId) {
      const spaceId = this.spaceService.getSpaceIdForDoc(currentDocId);
      if (spaceId) {
        options.spaceId = spaceId;
      }
      return options;
    }

    // If no currentDocId is available, check if we're in a space context
    // (e.g., viewing a space page)
    const globalSpaceId = this.globalContextService.globalContext.spaceId.get();
    if (globalSpaceId) {
      options.spaceId = globalSpaceId;
      return options;
    }

    // If no context is provided, document will be created in workspace root
    return options;
  }

  afterCreate(doc: DocRecord, docCreateOptions: DocCreateOptions): void {
    // Assign document to space if spaceId is provided
    // Fire-and-forget async call since afterCreate is synchronous
    if (docCreateOptions.spaceId) {
      this.spaceService
        .moveDocToSpace(doc.id, docCreateOptions.spaceId)
        .catch(error => {
          // Log error but don't throw - space assignment failure shouldn't break doc creation
          console.error('Failed to assign document to space:', error);
        });
    }
  }
}
