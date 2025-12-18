import { skipOnboarding, test } from '@affine-test/kit/playwright';
import {
  addUserToSpace,
  addUserToWorkspace,
  createRandomUser,
  createSpace,
  deleteSpace,
  enableCloudWorkspace,
  getDocSpaceId,
  loginUser,
  moveDocToSpace,
  SpaceRole,
} from '@affine-test/kit/utils/cloud';
import {
  waitForAllPagesLoad,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import { expect } from '@playwright/test';

let ownerUser: {
  id: string;
  name: string;
  email: string;
  password: string;
};

let memberUser: {
  id: string;
  name: string;
  email: string;
  password: string;
};

let workspaceId: string;

test.beforeEach(async ({ page }) => {
  // Create owner user and member user
  ownerUser = await createRandomUser();
  memberUser = await createRandomUser();

  // Login as owner and create a cloud workspace
  await loginUser(page, ownerUser);
  await page.reload();
  await waitForEditorLoad(page);

  await createLocalWorkspace({ name: 'test-workspace' }, page);
  await enableCloudWorkspace(page);

  // Get workspace ID from URL
  const currentUrl = page.url();
  workspaceId = currentUrl.split('/')[4];

  // Add member to workspace with read permission
  await addUserToWorkspace(workspaceId, memberUser.id, 1 /* READ */);
});

test.describe('space permissions', () => {
  test('space with Reader default role is visible to workspace members', async ({
    page: _page,
    browser,
  }) => {
    // Create a space with Reader default role (accessible to all workspace members)
    const space = await createSpace(
      workspaceId,
      ownerUser.id,
      'Accessible Space',
      SpaceRole.Reader
    );

    try {
      // Login as member in a new context
      const context = await browser.newContext();
      await skipOnboarding(context);
      const page2 = await context.newPage();
      await loginUser(page2, memberUser);
      await page2.reload();
      await waitForEditorLoad(page2);

      // Navigate to the workspace
      await page2.goto(`http://localhost:8080/workspace/${workspaceId}/all`);
      await waitForAllPagesLoad(page2);

      // Expand the Spaces section using the test ID
      const spacesSection = page2.getByTestId('navigation-panel-spaces');
      await spacesSection.click();
      await page2.waitForTimeout(1000);

      // Verify the space is visible in the navigation panel
      const spaceLink = page2.locator(`text=Accessible Space`).first();
      await expect(spaceLink).toBeVisible({ timeout: 10000 });

      await context.close();
    } finally {
      await deleteSpace(space.id);
    }
  });

  test('space with None default role is hidden from workspace members', async ({
    page: _page,
    browser,
  }) => {
    // Create a space with None (No Access) default role
    const space = await createSpace(
      workspaceId,
      ownerUser.id,
      'Private Space',
      SpaceRole.None
    );

    try {
      // Login as member in a new context
      const context = await browser.newContext();
      await skipOnboarding(context);
      const page2 = await context.newPage();
      await loginUser(page2, memberUser);
      await page2.reload();
      await waitForEditorLoad(page2);

      // Navigate to the workspace
      await page2.goto(`http://localhost:8080/workspace/${workspaceId}/all`);
      await waitForAllPagesLoad(page2);

      // Expand the Spaces section using the test ID
      const spacesSection = page2.getByTestId('navigation-panel-spaces');
      await spacesSection.click();
      await page2.waitForTimeout(1000);

      // Verify the private space is NOT visible in the navigation panel
      const spaceLink = page2.locator(`text=Private Space`);
      await expect(spaceLink).not.toBeVisible({ timeout: 3000 });

      await context.close();
    } finally {
      await deleteSpace(space.id);
    }
  });

  test('granting explicit role makes hidden space visible', async ({
    page: _page,
    browser,
  }) => {
    // Create a space with None (No Access) default role
    const space = await createSpace(
      workspaceId,
      ownerUser.id,
      'Initially Hidden Space',
      SpaceRole.None
    );

    try {
      // Login as member in a new context
      const context = await browser.newContext();
      await skipOnboarding(context);
      const page2 = await context.newPage();
      await loginUser(page2, memberUser);
      await page2.reload();
      await waitForEditorLoad(page2);

      // Navigate to the workspace
      await page2.goto(`http://localhost:8080/workspace/${workspaceId}/all`);
      await waitForAllPagesLoad(page2);

      // Expand the Spaces section using the test ID
      const spacesSection = page2.getByTestId('navigation-panel-spaces');
      await spacesSection.click();
      await page2.waitForTimeout(1000);

      // Verify the space is NOT visible initially
      const spaceLink = page2.locator(`text=Initially Hidden Space`);
      await expect(spaceLink).not.toBeVisible({ timeout: 3000 });

      // Grant the member explicit Editor access to the space
      await addUserToSpace(space.id, memberUser.id, SpaceRole.Editor);

      // Refresh the page
      await page2.reload();
      await waitForAllPagesLoad(page2);

      // Expand the Spaces section again using the test ID
      await page2.getByTestId('navigation-panel-spaces').click();
      await page2.waitForTimeout(1000);

      // Verify the space is now visible
      await expect(
        page2.locator(`text=Initially Hidden Space`).first()
      ).toBeVisible({ timeout: 5000 });

      await context.close();
    } finally {
      await deleteSpace(space.id);
    }
  });

  test('owner can always see all spaces', async ({ page }) => {
    // Create both accessible and private spaces
    const accessibleSpace = await createSpace(
      workspaceId,
      ownerUser.id,
      'Owner Accessible',
      SpaceRole.Reader
    );

    const privateSpace = await createSpace(
      workspaceId,
      ownerUser.id,
      'Owner Private',
      SpaceRole.None
    );

    try {
      // Navigate to workspace all page to see spaces
      await page.goto(`http://localhost:8080/workspace/${workspaceId}/all`);
      await waitForAllPagesLoad(page);

      // Expand the Spaces section using the test ID
      const spacesSection = page.getByTestId('navigation-panel-spaces');
      await spacesSection.click();
      await page.waitForTimeout(1000);

      // Owner should see both spaces
      await expect(page.locator(`text=Owner Accessible`).first()).toBeVisible({
        timeout: 10000,
      });
      await expect(page.locator(`text=Owner Private`).first()).toBeVisible({
        timeout: 10000,
      });
    } finally {
      await deleteSpace(accessibleSpace.id);
      await deleteSpace(privateSpace.id);
    }
  });

  test('docs in private spaces should not appear in All Docs for non-members', async ({
    page,
    browser,
  }) => {
    // Create a space with None default role (no access for members)
    const space = await createSpace(
      workspaceId,
      ownerUser.id,
      'Secret Space',
      SpaceRole.None
    );

    try {
      // Create a new doc as owner
      await page.goto(`http://localhost:8080/workspace/${workspaceId}/all`);
      await waitForAllPagesLoad(page);

      const newDocButton = page.getByTestId('new-page-button-trigger');
      await newDocButton.click();
      await waitForEditorLoad(page);

      // Get current doc ID from URL
      const docUrl = page.url();
      const docId = docUrl.split('/').pop()!;

      // Type a title to make it identifiable
      await page.keyboard.type('Secret Document');
      await page.waitForTimeout(1000);

      // Move doc to the private space via API
      await moveDocToSpace(docId, space.id);

      // Verify the doc is in the space
      const spaceId = await getDocSpaceId(docId);
      expect(spaceId).toBe(space.id);

      // Login as member who doesn't have space access
      const context = await browser.newContext();
      await skipOnboarding(context);
      const page2 = await context.newPage();
      await loginUser(page2, memberUser);
      await page2.reload();

      // Navigate to All Docs
      await page2.goto(`http://localhost:8080/workspace/${workspaceId}/all`);
      await waitForAllPagesLoad(page2);

      // Wait a bit for docs list to load
      await page2.waitForTimeout(2000);

      // The secret document should NOT be visible in All Docs
      const docLink = page2.locator('text=Secret Document');
      await expect(docLink).not.toBeVisible({ timeout: 3000 });

      await context.close();
    } finally {
      await deleteSpace(space.id);
    }
  });

  test('docs in accessible spaces should appear in All Docs', async ({
    page,
    browser,
  }) => {
    // Create a space with Reader default role
    const space = await createSpace(
      workspaceId,
      ownerUser.id,
      'Shared Space',
      SpaceRole.Reader
    );

    try {
      // Create a new doc as owner
      await page.goto(`http://localhost:8080/workspace/${workspaceId}/all`);
      await waitForAllPagesLoad(page);

      const newDocButton = page.getByTestId('new-page-button-trigger');
      await newDocButton.click();
      await waitForEditorLoad(page);

      // Get current doc ID from URL
      const docUrl = page.url();
      const docId = docUrl.split('/').pop()!;

      // Type a title to make it identifiable
      await page.keyboard.type('Shared Document');
      await page.waitForTimeout(1000);

      // Move doc to the shared space via API
      await moveDocToSpace(docId, space.id);

      // Login as member who has Reader access
      const context = await browser.newContext();
      await skipOnboarding(context);
      const page2 = await context.newPage();
      await loginUser(page2, memberUser);
      await page2.reload();

      // Navigate to All Docs
      await page2.goto(`http://localhost:8080/workspace/${workspaceId}/all`);
      await waitForAllPagesLoad(page2);

      // Wait a bit for docs list to load
      await page2.waitForTimeout(2000);

      // The shared document should be visible in All Docs
      const docLink = page2.locator('text=Shared Document');
      await expect(docLink).toBeVisible({ timeout: 10000 });

      await context.close();
    } finally {
      await deleteSpace(space.id);
    }
  });

  test('owner can see all docs regardless of space permissions', async ({
    page,
  }) => {
    // Create a private space
    const space = await createSpace(
      workspaceId,
      ownerUser.id,
      'Owner Private Space',
      SpaceRole.None
    );

    try {
      // Create a new doc as owner
      await page.goto(`http://localhost:8080/workspace/${workspaceId}/all`);
      await waitForAllPagesLoad(page);

      const newDocButton = page.getByTestId('new-page-button-trigger');
      await newDocButton.click();
      await waitForEditorLoad(page);

      // Get current doc ID from URL
      const docUrl = page.url();
      const docId = docUrl.split('/').pop()!;

      // Type a title to make it identifiable
      await page.keyboard.type('Private Owner Doc');
      await page.waitForTimeout(1000);

      // Move doc to the private space via API
      await moveDocToSpace(docId, space.id);

      // Navigate back to All Docs
      await page.goto(`http://localhost:8080/workspace/${workspaceId}/all`);
      await waitForAllPagesLoad(page);

      // Wait a bit for docs list to load
      await page.waitForTimeout(2000);

      // Owner should still see the doc
      const docLink = page.locator('text=Private Owner Doc');
      await expect(docLink).toBeVisible({ timeout: 10000 });
    } finally {
      await deleteSpace(space.id);
    }
  });
});
