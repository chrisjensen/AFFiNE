import { PrismaClient } from '@prisma/client';
import * as Y from 'yjs';

async function main() {
  const prisma = new PrismaClient();

  const spaceId = '78d0f58f-1553-427e-9350-f9cb08a3d67e';
  const workspaceId = 'bc998f44-5548-41ae-a861-2449683a2c5b';

  const snapshot = await prisma.snapshot.findUnique({
    where: {
      workspaceId_id: {
        workspaceId,
        id: spaceId,
      },
    },
  });

  if (snapshot === null) {
    console.log('Space root doc not found!');
    await prisma.$disconnect();
    return;
  }

  console.log('Found snapshot, blob size:', snapshot.blob.length);

  const yDoc = new Y.Doc({ guid: spaceId });
  Y.applyUpdate(yDoc, snapshot.blob);

  const meta = yDoc.getMap('meta');
  console.log('Meta keys:', Array.from(meta.keys()));

  const pages = meta.get('pages');
  console.log(
    'Pages type:',
    pages && pages.constructor ? pages.constructor.name : typeof pages
  );

  if (pages && typeof pages.length !== 'undefined') {
    console.log('Pages length:', pages.length);
    if (pages.length > 0) {
      console.log('Pages content:');
      for (let i = 0; i < pages.length; i++) {
        console.log('  -', JSON.stringify(pages.get(i)));
      }
    }
  }

  const name = meta.get('name');
  console.log('Space name:', name);

  // Also check SpaceDoc table
  const spaceDocs = await prisma.spaceDoc.findMany({
    where: { spaceId },
  });
  console.log('\nSpaceDoc entries for this space:', spaceDocs.length);
  spaceDocs.forEach(sd => console.log('  - docId:', sd.docId));

  await prisma.$disconnect();
}

main().catch(console.error);
