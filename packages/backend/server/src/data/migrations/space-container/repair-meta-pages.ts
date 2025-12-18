import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  applyUpdate,
  Array as YArray,
  Doc as YDoc,
  encodeStateAsUpdate,
  Map as YMap,
} from 'yjs';

const logger = new Logger('RepairMetaPagesMigration');

interface PlainDocMeta {
  id: string;
  title?: string;
  createDate?: number;
  tags?: string[];
  trash?: boolean;
  trashDate?: number;
  [key: string]: unknown;
}

/**
 * Repair migration for corrupted meta.pages entries.
 *
 * This migration fixes workspace root docs and space root docs that have
 * plain JavaScript objects in meta.pages instead of YMap instances.
 *
 * The root cause was that early versions of the space-container migration
 * and space-doc.ts pushed plain objects instead of YMaps into the YArray.
 * Yjs does NOT auto-convert plain objects to YMaps, causing frontend errors
 * like "v.get is not a function" when the frontend tries to call .get() on
 * what it expects to be a YMap.
 */
export async function repairMetaPages(prisma: PrismaClient) {
  logger.log('Starting meta.pages repair migration...');

  let totalFixed = 0;
  let totalSkipped = 0;

  // Step 1: Fix all workspace root docs
  const workspaces = await prisma.workspace.findMany({
    select: { id: true },
  });

  logger.log(`Found ${workspaces.length} workspaces to check`);

  for (const workspace of workspaces) {
    const fixed = await repairRootDoc(prisma, workspace.id, workspace.id);
    if (fixed) {
      totalFixed++;
    } else {
      totalSkipped++;
    }
  }

  // Step 2: Fix all space root docs
  const spaces = await prisma.workspaceSpace.findMany({
    select: { id: true, workspaceId: true, name: true },
  });

  logger.log(`Found ${spaces.length} spaces to check`);

  for (const space of spaces) {
    const fixed = await repairRootDoc(prisma, space.workspaceId, space.id);
    if (fixed) {
      totalFixed++;
    } else {
      totalSkipped++;
    }
  }

  logger.log(
    `meta.pages repair migration completed. Fixed: ${totalFixed}, Skipped: ${totalSkipped}`
  );
}

/**
 * Repair a single root document's meta.pages array.
 * Returns true if repairs were made, false otherwise.
 */
async function repairRootDoc(
  prisma: PrismaClient,
  workspaceId: string,
  docId: string
): Promise<boolean> {
  // Get existing root doc
  const snapshot = await prisma.snapshot.findUnique({
    where: {
      workspaceId_id: {
        workspaceId,
        id: docId,
      },
    },
  });

  if (!snapshot) {
    logger.debug(`Root doc [${docId}] not found, skipping`);
    return false;
  }

  // Load the Yjs document
  const yDoc = new YDoc({ guid: docId });
  applyUpdate(yDoc, snapshot.blob);
  const meta = yDoc.getMap('meta') as YMap<unknown>;
  const pages = meta.get('pages') as YArray<unknown> | undefined;

  if (!pages || pages.length === 0) {
    logger.debug(`Root doc [${docId}] has no pages, skipping`);
    return false;
  }

  // Check if any items are plain objects (need repair)
  let needsRepair = false;
  const itemsToConvert: Array<{ index: number; data: PlainDocMeta }> = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages.get(i);

    if (page instanceof YMap) {
      // Already a YMap, no repair needed for this item
      continue;
    }

    if (page && typeof page === 'object' && 'id' in page) {
      // Plain object - needs conversion to YMap
      needsRepair = true;
      itemsToConvert.push({
        index: i,
        data: page as PlainDocMeta,
      });
    }
  }

  if (!needsRepair) {
    logger.debug(`Root doc [${docId}] meta.pages is already valid`);
    return false;
  }

  logger.log(
    `Repairing ${itemsToConvert.length} corrupted items in root doc [${docId}]`
  );

  // Convert plain objects to YMaps
  // We need to replace items in-place to maintain order and CRDT consistency
  yDoc.transact(() => {
    // Process in reverse order so indices don't shift
    for (let i = itemsToConvert.length - 1; i >= 0; i--) {
      const { index, data } = itemsToConvert[i];

      // Delete the plain object
      pages.delete(index, 1);

      // Create a proper YMap with all the original data
      const ymap = new YMap<unknown>();
      ymap.set('id', data.id);
      ymap.set('title', data.title ?? '');
      ymap.set('createDate', data.createDate ?? Date.now());

      // Convert tags array to YArray
      const tagsArray = new YArray<string>();
      if (Array.isArray(data.tags)) {
        for (const tag of data.tags) {
          tagsArray.push([tag]);
        }
      }
      ymap.set('tags', tagsArray);

      // Preserve other metadata fields
      if (data.trash !== undefined) {
        ymap.set('trash', data.trash);
      }
      if (data.trashDate !== undefined) {
        ymap.set('trashDate', data.trashDate);
      }

      // Insert at the same position
      pages.insert(index, [ymap]);
    }
  });

  // Save the repaired document
  const update = encodeStateAsUpdate(yDoc);
  await prisma.snapshot.update({
    where: {
      workspaceId_id: {
        workspaceId,
        id: docId,
      },
    },
    data: {
      blob: Buffer.from(update),
      updatedAt: new Date(),
    },
  });

  logger.log(
    `Repaired root doc [${docId}] - converted ${itemsToConvert.length} items`
  );
  return true;
}
