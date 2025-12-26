/**
 * Recovery script for docs missing from workspace meta.pages after move operation.
 *
 * This script adds missing docs back to the workspace's meta.pages YDoc.
 * Run with: npx tsx scripts/recover-missing-docs.ts <workspaceId> [docId1] [docId2] ...
 *
 * If no docIds are provided, it will attempt to find docs that exist in space_docs
 * but are missing from workspace meta.pages.
 */
import { PrismaClient } from '@prisma/client';
import {
  applyUpdate,
  Array as YArray,
  Doc as YDoc,
  encodeStateAsUpdate,
  Map as YMap,
} from 'yjs';

async function ensureDocInWorkspaceMeta(
  prisma: PrismaClient,
  workspaceId: string,
  docId: string
): Promise<void> {
  // Get the workspace root doc
  const snapshot = await prisma.snapshot.findUnique({
    where: {
      workspaceId_id: {
        workspaceId: workspaceId,
        id: workspaceId,
      },
    },
  });

  if (!snapshot) {
    console.warn(
      `Workspace root doc [${workspaceId}] not found, skipping doc [${docId}]`
    );
    return;
  }

  // Load the Yjs document
  const yDoc = new YDoc({ guid: workspaceId });
  applyUpdate(yDoc, snapshot.blob);

  const meta = yDoc.getMap('meta') as YMap<unknown>;
  if (!meta.has('pages')) {
    meta.set('pages', new YArray<YMap<unknown>>());
  }

  const pages = meta.get('pages') as YArray<YMap<unknown>>;

  // Check if doc already exists
  for (let i = 0; i < pages.length; i++) {
    const page = pages.get(i);
    if (page.get('id') === docId) {
      console.log(`Doc [${docId}] already in workspace meta.pages, skipping`);
      return; // Already exists, nothing to do
    }
  }

  // Doc not found in workspace meta.pages - add it
  console.log(`Adding doc [${docId}] to workspace meta.pages`);

  // Try to get doc metadata from snapshot if available
  const docSnapshot = await prisma.snapshot.findUnique({
    where: {
      workspaceId_id: {
        workspaceId: workspaceId,
        id: docId,
      },
    },
  });

  let title = '';
  let createDate = Date.now();

  if (docSnapshot) {
    try {
      const docYDoc = new YDoc();
      applyUpdate(docYDoc, docSnapshot.blob);
      const docMeta = docYDoc.getMap('meta') as YMap<unknown>;
      title = (docMeta.get('title') as string) || '';
      createDate = (docMeta.get('createDate') as number) || Date.now();
    } catch (error) {
      console.warn(`Failed to extract metadata from doc [${docId}]:`, error);
    }
  }

  const docMap = new YMap<unknown>([
    ['id', docId],
    ['title', title],
    ['createDate', createDate],
    ['tags', new YArray()],
  ]);

  pages.push([docMap]);

  // Save the updated doc
  const update = encodeStateAsUpdate(yDoc);
  await prisma.snapshot.update({
    where: {
      workspaceId_id: {
        workspaceId: workspaceId,
        id: workspaceId,
      },
    },
    data: {
      blob: Buffer.from(update),
      updatedAt: new Date(),
    },
  });

  console.log(`Successfully added doc [${docId}] to workspace meta.pages`);
}

async function findMissingDocs(
  prisma: PrismaClient,
  workspaceId: string
): Promise<string[]> {
  // Get all docs in space_docs for this workspace
  const spaceDocs = await prisma.spaceDoc.findMany({
    where: {
      space: {
        workspaceId: workspaceId,
      },
    },
    select: {
      docId: true,
    },
    distinct: ['docId'],
  });

  const docIdsInSpaces = new Set(spaceDocs.map(sd => sd.docId));

  // Get workspace root doc
  const snapshot = await prisma.snapshot.findUnique({
    where: {
      workspaceId_id: {
        workspaceId: workspaceId,
        id: workspaceId,
      },
    },
  });

  if (!snapshot) {
    console.warn(`Workspace root doc [${workspaceId}] not found`);
    return Array.from(docIdsInSpaces);
  }

  // Load the Yjs document
  const yDoc = new YDoc({ guid: workspaceId });
  applyUpdate(yDoc, snapshot.blob);

  const meta = yDoc.getMap('meta') as YMap<unknown>;
  const pages = meta.get('pages') as YArray<YMap<unknown>> | undefined;

  const docIdsInMetaPages = new Set<string>();
  if (pages) {
    for (let i = 0; i < pages.length; i++) {
      const page = pages.get(i);
      const docId = page.get('id') as string;
      if (docId) {
        docIdsInMetaPages.add(docId);
      }
    }
  }

  // Find docs that are in space_docs but not in meta.pages
  const missing = Array.from(docIdsInSpaces).filter(
    id => !docIdsInMetaPages.has(id)
  );

  return missing;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      'Usage: npx tsx scripts/recover-missing-docs.ts <workspaceId> [docId1] [docId2] ...'
    );
    console.error('If no docIds provided, will auto-detect missing docs');
    process.exit(1);
  }

  const workspaceId = args[0];
  const explicitDocIds = args.slice(1);

  const prisma = new PrismaClient();

  try {
    console.log(`Recovering docs for workspace [${workspaceId}]...`);

    let docIdsToRecover: string[];

    if (explicitDocIds.length > 0) {
      docIdsToRecover = explicitDocIds;
      console.log(
        `Recovering ${docIdsToRecover.length} explicitly specified docs`
      );
    } else {
      console.log('Auto-detecting missing docs...');
      docIdsToRecover = await findMissingDocs(prisma, workspaceId);
      console.log(
        `Found ${docIdsToRecover.length} missing docs:`,
        docIdsToRecover
      );
    }

    if (docIdsToRecover.length === 0) {
      console.log('No docs to recover!');
      return;
    }

    for (const docId of docIdsToRecover) {
      await ensureDocInWorkspaceMeta(prisma, workspaceId, docId);
    }

    console.log(`Successfully recovered ${docIdsToRecover.length} docs!`);
  } catch (error) {
    console.error('Recovery failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
