import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  applyUpdate,
  Array as YArray,
  Doc as YDoc,
  encodeStateAsUpdate,
  Map as YMap,
} from 'yjs';

const logger = new Logger('SpaceContainerMigration');

/**
 * Data migration for Space-as-Container architecture.
 *
 * This migration:
 * 1. Updates containerSpaceId (space_id) for docs in the SpaceDoc mapping table
 * 2. Creates root documents for existing spaces that don't have them
 * 3. Populates space root docs' meta.pages with existing docs
 *
 * This should be run AFTER the schema migration (20251217000000_add_space_id_to_doc_tables)
 */
export async function migrateSpaceContainers(prisma: PrismaClient) {
  logger.log('Starting Space-as-Container migration...');

  // Step 1: Get all existing space-doc mappings
  const spaceDocs = await prisma.spaceDoc.findMany({
    orderBy: { createdAt: 'asc' },
  });

  logger.log(`Found ${spaceDocs.length} docs in spaces to migrate`);

  // Group docs by space
  const docsBySpace = new Map<string, string[]>();
  for (const spaceDoc of spaceDocs) {
    const docs = docsBySpace.get(spaceDoc.spaceId) || [];
    docs.push(spaceDoc.docId);
    docsBySpace.set(spaceDoc.spaceId, docs);
  }

  // Step 2: Get all spaces
  const spaces = await prisma.workspaceSpace.findMany();
  logger.log(`Found ${spaces.length} spaces to process`);

  for (const space of spaces) {
    logger.log(
      `Processing space [${space.id}] in workspace [${space.workspaceId}]`
    );

    // Step 2a: Check if space root doc exists
    const existingRootDoc = await prisma.snapshot.findUnique({
      where: {
        workspaceId_id: {
          workspaceId: space.workspaceId,
          id: space.id,
        },
      },
    });

    if (!existingRootDoc) {
      // Create space root document
      logger.log(`Creating root doc for space [${space.id}]`);
      await createSpaceRootDoc(prisma, space.workspaceId, space.id, space.name);
    }

    // Step 2b: Update containerSpaceId for docs in this space
    const docIds = docsBySpace.get(space.id) || [];
    if (docIds.length > 0) {
      logger.log(
        `Updating containerSpaceId for ${docIds.length} docs in space [${space.id}]`
      );

      // Update snapshots
      await prisma.snapshot.updateMany({
        where: {
          workspaceId: space.workspaceId,
          id: { in: docIds },
        },
        data: {
          spaceId: space.id,
        },
      });

      // Update updates
      await prisma.update.updateMany({
        where: {
          workspaceId: space.workspaceId,
          id: { in: docIds },
        },
        data: {
          spaceId: space.id,
        },
      });

      // Update snapshot histories
      await prisma.snapshotHistory.updateMany({
        where: {
          workspaceId: space.workspaceId,
          id: { in: docIds },
        },
        data: {
          spaceId: space.id,
        },
      });

      // Step 2c: Update space root doc's meta.pages with the docs
      await updateSpaceRootDocPages(
        prisma,
        space.workspaceId,
        space.id,
        docIds
      );
    }
  }

  logger.log('Space-as-Container migration completed successfully');
}

/**
 * Create a new space root document with meta.pages array.
 */
async function createSpaceRootDoc(
  prisma: PrismaClient,
  workspaceId: string,
  spaceId: string,
  spaceName: string
) {
  const rootDoc = new YDoc({ guid: spaceId });
  const meta = rootDoc.getMap('meta') as YMap<unknown>;

  meta.set('pages', new YArray());
  meta.set('name', spaceName);

  const update = encodeStateAsUpdate(rootDoc);

  await prisma.snapshot.create({
    data: {
      workspaceId,
      id: spaceId,
      blob: Buffer.from(update),
      updatedAt: new Date(),
      // Root doc is at workspace level (not inside any space)
      spaceId: null,
    },
  });

  logger.log(`Created space root document [${spaceId}]`);
}

/**
 * Update an existing space root doc's meta.pages with the given doc IDs.
 */
async function updateSpaceRootDocPages(
  prisma: PrismaClient,
  workspaceId: string,
  spaceId: string,
  docIds: string[]
) {
  // Get existing root doc
  const existingSnapshot = await prisma.snapshot.findUnique({
    where: {
      workspaceId_id: {
        workspaceId,
        id: spaceId,
      },
    },
  });

  if (!existingSnapshot) {
    logger.warn(`Space root doc [${spaceId}] not found, skipping pages update`);
    return;
  }

  // Load the Yjs document with existing data
  const rootDoc = new YDoc({ guid: spaceId });
  applyUpdate(rootDoc, existingSnapshot.blob);
  const meta = rootDoc.getMap('meta') as YMap<unknown>;

  // Initialize pages array if needed
  if (!meta.has('pages')) {
    meta.set('pages', new YArray());
  }

  const pages = meta.get('pages') as YArray<unknown>;

  // Add docs that don't already exist in meta.pages
  const existingIds = new Set<string>();
  for (let i = 0; i < pages.length; i++) {
    const page = pages.get(i);
    // Handle both YMap (correct) and plain object (legacy/corrupted) formats
    let pageId: string | undefined;
    if (page instanceof YMap) {
      pageId = page.get('id') as string | undefined;
    } else if (page && typeof page === 'object' && 'id' in page) {
      pageId = (page as { id?: string }).id;
    }
    if (pageId) {
      existingIds.add(pageId);
    }
  }

  // Add new docs to meta.pages
  const docsToAdd = docIds.filter(id => !existingIds.has(id));
  if (docsToAdd.length > 0) {
    rootDoc.transact(() => {
      for (const docId of docsToAdd) {
        // IMPORTANT: Must use YMap for proper CRDT sync with frontend
        pages.push([
          new YMap<unknown>([
            ['id', docId],
            ['title', ''],
            ['createDate', Date.now()],
            ['tags', new YArray()],
          ]),
        ]);
      }
    });

    // Save updated root doc
    const update = encodeStateAsUpdate(rootDoc);
    await prisma.snapshot.update({
      where: {
        workspaceId_id: {
          workspaceId,
          id: spaceId,
        },
      },
      data: {
        blob: Buffer.from(update),
        updatedAt: new Date(),
      },
    });

    logger.log(
      `Added ${docsToAdd.length} docs to space root doc [${spaceId}] meta.pages`
    );
  }
}

/**
 * Rollback migration - remove space_id from docs and delete space root docs.
 * Use with caution!
 */
export async function rollbackSpaceContainers(prisma: PrismaClient) {
  logger.log('Rolling back Space-as-Container migration...');

  // Clear space_id from all docs
  await prisma.snapshot.updateMany({
    where: { spaceId: { not: null } },
    data: { spaceId: null },
  });

  await prisma.update.updateMany({
    where: { spaceId: { not: null } },
    data: { spaceId: null },
  });

  await prisma.snapshotHistory.updateMany({
    where: { spaceId: { not: null } },
    data: { spaceId: null },
  });

  // Delete space root documents
  const spaces = await prisma.workspaceSpace.findMany();
  for (const space of spaces) {
    await prisma.snapshot.deleteMany({
      where: {
        workspaceId: space.workspaceId,
        id: space.id,
      },
    });
  }

  logger.log('Space-as-Container rollback completed');
}

export { repairMetaPages } from './repair-meta-pages';
