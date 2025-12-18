/**
 * Repair script for corrupted meta.pages entries.
 *
 * This script fixes workspace root docs and space root docs that have
 * plain JavaScript objects in meta.pages instead of YMap instances.
 *
 * Run with: npx tsx scripts/repair-meta-pages.ts
 */
import { PrismaClient } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- script needs to import from src
import { repairMetaPages } from '../src/data/migrations/space-container';

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log('Starting meta.pages repair migration...');
    await repairMetaPages(prisma);
    console.log('Repair migration completed successfully!');
  } catch (error) {
    console.error('Repair migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
