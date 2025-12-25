import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { applyUpdate, Array as YArray, Doc as YDoc, Map as YMap } from 'yjs';

const logger = new Logger('ConsolidateSpaceMembership');

/**
 * Migration: Consolidate space membership to SpaceDoc table only
 *
 * PROBLEM:
 * Space membership was tracked in THREE places that could get out of sync:
 * 1. SpaceDoc table (space_docs) - the authoritative source for GraphQL
 * 2. Snapshot.space_id column - redundant, could diverge from SpaceDoc
 * 3. space.meta.pages (Y.Doc) - written by backend, ignored by frontend
 *
 * SOLUTION:
 * This migration ensures SpaceDoc has all the data from the other two sources,
 * allowing us to safely remove Snapshot.space_id and space.meta.pages writes.
 *
 * Steps:
 * 1. Find docs in Snapshot.space_id that are NOT in SpaceDoc → add to SpaceDoc
 * 2. Find docs in space.meta.pages that are NOT in SpaceDoc → add to SpaceDoc
 *
 * After this migration, we can:
 * - Remove the Snapshot.space_id column (schema migration)
 * - Stop writing to space.meta.pages (code changes)
 *
 * NOTE: This migration uses raw SQL to query the space_id column, which may
 * have already been removed from the Prisma schema but not yet from the database.
 */
export class ConsolidateSpaceMembership1735084800000 {
  static async up(db: PrismaClient) {
    logger.log('Starting space membership consolidation...');

    let addedFromSnapshot = 0;
    let addedFromMetaPages = 0;

    // Step 1: Get all existing SpaceDoc entries
    const existingSpaceDocs = await db.spaceDoc.findMany({
      select: { docId: true, spaceId: true },
    });
    const spaceDocSet = new Set(
      existingSpaceDocs.map(sd => `${sd.spaceId}:${sd.docId}`)
    );
    logger.log(`Found ${existingSpaceDocs.length} existing SpaceDoc entries`);

    // Step 2: Find docs with space_id in Snapshot that are NOT in SpaceDoc
    // Use raw SQL since the Prisma schema may not have the space_id column anymore
    interface SnapshotWithSpace {
      guid: string;
      workspace_id: string;
      space_id: string | null;
    }
    const snapshotsWithSpace = await db.$queryRaw<SnapshotWithSpace[]>`
      SELECT guid, workspace_id, space_id
      FROM snapshots
      WHERE space_id IS NOT NULL
    `;
    logger.log(
      `Found ${snapshotsWithSpace.length} snapshots with space_id set`
    );

    for (const snap of snapshotsWithSpace) {
      if (!snap.space_id) continue;

      const key = `${snap.space_id}:${snap.guid}`;
      if (!spaceDocSet.has(key)) {
        // Verify the space exists before creating the SpaceDoc entry
        const spaceExists = await db.workspaceSpace.findUnique({
          where: { id: snap.space_id },
          select: { id: true },
        });

        if (spaceExists) {
          try {
            await db.spaceDoc.create({
              data: { spaceId: snap.space_id, docId: snap.guid },
            });
            spaceDocSet.add(key); // Track to avoid duplicates
            addedFromSnapshot++;
            logger.log(
              `Added missing SpaceDoc from Snapshot: ${snap.guid} → ${snap.space_id}`
            );
          } catch (error) {
            // Ignore duplicate key errors (race condition protection)
            if (
              !(error instanceof Error) ||
              !error.message.includes('Unique constraint')
            ) {
              throw error;
            }
          }
        } else {
          logger.warn(
            `Skipping orphaned snapshot ${snap.guid} - space ${snap.space_id} does not exist`
          );
        }
      }
    }

    // Step 3: Parse space.meta.pages from each space's root doc
    const spaces = await db.workspaceSpace.findMany({
      select: { id: true, workspaceId: true },
    });
    logger.log(`Found ${spaces.length} spaces to check meta.pages`);

    for (const space of spaces) {
      const spaceRootDoc = await db.snapshot.findUnique({
        where: {
          workspaceId_id: { workspaceId: space.workspaceId, id: space.id },
        },
        select: { blob: true },
      });

      if (!spaceRootDoc?.blob) {
        logger.debug(`Space ${space.id} has no root doc, skipping`);
        continue;
      }

      const docIdsFromMeta = extractDocIdsFromMetaPages(spaceRootDoc.blob);

      for (const docId of docIdsFromMeta) {
        const key = `${space.id}:${docId}`;
        if (!spaceDocSet.has(key)) {
          // Verify the doc exists before creating the SpaceDoc entry
          const docExists = await db.snapshot.findUnique({
            where: {
              workspaceId_id: { workspaceId: space.workspaceId, id: docId },
            },
            select: { id: true },
          });

          if (docExists) {
            try {
              await db.spaceDoc.create({
                data: { spaceId: space.id, docId },
              });
              spaceDocSet.add(key); // Track to avoid duplicates
              addedFromMetaPages++;
              logger.log(
                `Added missing SpaceDoc from meta.pages: ${docId} → ${space.id}`
              );
            } catch (error) {
              // Ignore duplicate key errors (race condition protection)
              if (
                !(error instanceof Error) ||
                !error.message.includes('Unique constraint')
              ) {
                throw error;
              }
            }
          } else {
            logger.warn(
              `Skipping orphaned meta.pages entry ${docId} - doc does not exist in workspace ${space.workspaceId}`
            );
          }
        }
      }
    }

    logger.log(
      `Space membership consolidation completed. ` +
        `Added ${addedFromSnapshot} from Snapshot.space_id, ` +
        `${addedFromMetaPages} from space.meta.pages`
    );
  }

  static async down(_db: PrismaClient) {
    // This migration only adds data, no rollback needed
    // The data that was added is valid and should remain
    logger.log('Rollback not needed - consolidation only adds missing entries');
  }
}

/**
 * Extract doc IDs from a space root doc's meta.pages Y.Doc blob.
 */
function extractDocIdsFromMetaPages(blob: Uint8Array): string[] {
  const docIds: string[] = [];

  try {
    const yDoc = new YDoc();
    applyUpdate(yDoc, blob);

    const meta = yDoc.getMap('meta') as YMap<unknown>;
    const pages = meta.get('pages') as YArray<unknown> | undefined;

    if (!pages) {
      return docIds;
    }

    for (let i = 0; i < pages.length; i++) {
      const page = pages.get(i);

      // Handle both YMap (correct) and plain object (legacy/corrupted) formats
      let pageId: string | undefined;
      if (page instanceof YMap) {
        pageId = page.get('id') as string | undefined;
      } else if (page && typeof page === 'object' && 'id' in page) {
        pageId = (page as { id?: string }).id;
      }

      if (pageId && typeof pageId === 'string') {
        docIds.push(pageId);
      }
    }
  } catch (error) {
    logger.warn(`Failed to parse meta.pages from blob: ${error}`);
  }

  return docIds;
}
