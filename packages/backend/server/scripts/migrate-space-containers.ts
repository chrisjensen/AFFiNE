/**
 * One-time migration script for Space-as-Container architecture.
 *
 * Run with: npx tsx scripts/migrate-space-containers.ts
 */
import { PrismaClient } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- script needs to import from src
import { migrateSpaceContainers } from '../src/data/migrations/space-container';

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log('Starting Space-as-Container migration...');
    await migrateSpaceContainers(prisma);
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
