import type { DocProps } from '@affine/core/blocksuite/initialization';
import type { DocMode } from '@blocksuite/affine/model';

export interface DocCreateOptions {
  id?: string;
  title?: string;
  primaryMode?: DocMode;
  skipInit?: boolean;
  docProps?: DocProps;
  isTemplate?: boolean;
  /**
   * The space ID to create the doc in.
   * If provided, the doc will be added to the space's meta.pages.
   */
  spaceId?: string;
  /**
   * Source document ID for context (e.g., template document ID).
   * Used by middleware to determine space inheritance.
   */
  sourceDocId?: string;
  /**
   * Current document ID for context (e.g., document where command was invoked).
   * Used by middleware to determine space inheritance.
   */
  currentDocId?: string;
}
