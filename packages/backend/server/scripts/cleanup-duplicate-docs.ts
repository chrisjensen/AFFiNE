/**
 * Cleanup script to remove duplicate doc records created by the move bug.
 *
 * This script finds docs that exist in multiple workspaces and deletes
 * the older duplicates, keeping only the newest version.
 *
 * Run with: npx tsx scripts/cleanup-duplicate-docs.ts [--dry-run]
 *
 * Use --dry-run to see what would be deleted without actually deleting.
 */
import { PrismaClient } from '@prisma/client';

async function findDuplicates(prisma: PrismaClient) {
  // Find all docs that exist in multiple workspaces
  const duplicates = await prisma.$queryRaw<
    Array<{
      guid: string;
      workspace_ids: string[];
      timestamps: Date[];
    }>
  >`
    SELECT 
      guid,
      array_agg(workspace_id) as workspace_ids,
      array_agg(updated_at) as timestamps
    FROM snapshots
    GROUP BY guid
    HAVING COUNT(*) > 1
  `;

  return duplicates;
}

async function cleanupDuplicates(
  prisma: PrismaClient,
  dryRun: boolean = false
) {
  const duplicates = await findDuplicates(prisma);

  if (duplicates.length === 0) {
    console.log('No duplicate docs found.');
    return;
  }

  console.log(`Found ${duplicates.length} duplicate doc(s):`);
  for (const dup of duplicates) {
    console.log(
      `  - Doc ${dup.guid}: exists in ${dup.workspace_ids.length} workspace(s)`
    );
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Would delete the following records:');
  } else {
    console.log('\nDeleting older duplicate records...');
  }

  let deletedCount = 0;

  for (const dup of duplicates) {
    // Find all records for this doc
    const records = await prisma.snapshot.findMany({
      where: { id: dup.guid },
      select: {
        workspaceId: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (records.length <= 1) {
      continue;
    }

    // Keep the newest, delete the rest
    const newest = records[0];
    const toDelete = records.slice(1);

    for (const record of toDelete) {
      if (dryRun) {
        console.log(
          `  Would delete: workspace=${record.workspaceId}, doc=${dup.guid}, updated_at=${record.updatedAt}`
        );
      } else {
        await prisma.snapshot.delete({
          where: {
            workspaceId_id: {
              workspaceId: record.workspaceId,
              id: dup.guid,
            },
          },
        });
        console.log(
          `  Deleted: workspace=${record.workspaceId}, doc=${dup.guid}, updated_at=${record.updatedAt}`
        );
        deletedCount++;
      }
    }
  }

  if (dryRun) {
    console.log(`\n[DRY RUN] Would delete ${deletedCount} duplicate record(s)`);
  } else {
    console.log(`\nDeleted ${deletedCount} duplicate record(s)`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const prisma = new PrismaClient();

  try {
    await cleanupDuplicates(prisma, dryRun);
  } catch (error) {
    console.error('Error cleaning up duplicates:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
