// @ts-check
import { test, expect } from "@playwright/test";

// // Haven't quite gotten the code to clear existing batches sorted out yet.
// test.beforeEach(async ({ page: adminPage }, testInfo) => {
//   console.log(`Running ${testInfo.title}`);
//   await adminPage.goto("http://localhost:3000/admin/");
//   await adminPage.waitForTimeout(3000);

//   const startButtons = adminPage.getByTestId("startButton");
//   const nStartButtons = await startButtons.count();
//   console.log(nStartButtons, "start buttons");
//   for (let i = 0; i < nStartButtons; i++) {
//     await startButtons.nth(i).click();
//     await adminPage.waitForTimeout(1000);
//   }

//   const stopButtons = adminPage.getByTestId("stopButton");
//   const nStopButtons = await stopButtons.count();
//   console.log(nStopButtons, "stop buttons");
//   for (let i = 0; i < nStopButtons; i++) {
//     adminPage.on("dialog", (dialog) => dialog.accept()); // accept the confirmation
//     await stopButtons.nth(i).click();
//     await adminPage.waitForTimeout(1000);
//   }
// });

test("testTwoPlayerGames", async ({ browser }) => {
  const context = await browser.newContext();

  const n_players = 40;
  const playerKeys = [...Array(n_players)].map(
    () => `player_${Math.floor(Math.random() * 1e13)}`
  );

  // set up pages
  const adminPage = await context.newPage();
  await adminPage.goto("http://localhost:3000/admin/");

  const playerPages = [];
  for (const playerKey of playerKeys) {
    const page = await context.newPage();
    await page.goto(`http://localhost:3000/?participantKey=${playerKey}`);
    playerPages.push(page);
  }

  for (const page of playerPages) {
    await expect(
      page.getByRole("heading", { name: "No experiments available" })
    ).toBeVisible();
  }

  // go to admin console
  await expect(
    adminPage.getByRole("heading", { name: "Batches" })
  ).toBeVisible();
  await adminPage.getByTestId("newBatchButton").click();

  // enter batch drawer

  await expect(
    adminPage.getByText("Assignment Method", { exact: true })
  ).toBeVisible();
  await expect(
    adminPage.locator("label").filter({ hasText: "Treatments" })
  ).toBeVisible();

  await adminPage.getByTestId("treatmentSelect").selectOption("Two Players");
  await adminPage.locator('[data-test="gameCountInput"]').first().click();
  await adminPage
    .locator('[data-test="gameCountInput"]')
    .first()
    .press("Meta+a");
  await adminPage
    .locator('[data-test="gameCountInput"]')
    .first()
    .fill(`${Math.floor(n_players / 2)}`);

  await adminPage.getByTestId("createBatchButton").click();
  await expect(
    adminPage.getByText("Assignment Method", { exact: true })
  ).not.toBeVisible();

  // check batch is created and start it
  // await expect(adminPage.getByText("Created")).toBeVisible();
  await expect(adminPage.getByTestId("startButton")).toBeVisible();
  await expect(
    adminPage
      .locator("li")
      .filter({ hasText: "Created" })
      .getByTestId("duplicateButton")
  ).toBeVisible();
  await adminPage.getByTestId("startButton").click();

  // check batch is started
  await expect(adminPage.getByTestId("stopButton")).toBeVisible();
  await expect(adminPage.getByText("Running")).toBeVisible();

  // Intro steps
  for (let i = 0; i < playerPages.length; i++) {
    const page = playerPages[i];
    const playerKey = playerKeys[i];

    await expect(
      page.getByRole("heading", { name: "Do you consent to participate" })
    ).toBeVisible();
    await page.getByRole("button", { name: "I AGREE" }).click();
    await expect(
      page.getByRole("heading", { name: "Enter your Player Identifier" })
    ).toBeVisible();

    await page.locator("#playerID").click();
    await page.locator("#playerID").fill(playerKey);
    await page.getByRole("button", { name: "Enter" }).click();

    await expect(
      page.getByRole("heading", { name: "Instruction One" })
    ).toBeVisible();

    await page.getByRole("button", { name: "Next" }).click();
  }

  // JellyBeans Stage 1
  for (let i = 0; i < playerPages.length; i++) {
    const page = playerPages[i];

    await expect(page.getByText("Round 1 - Jelly Beans")).toBeVisible();
    await expect(page.getByText("Guess how many Jelly Beans")).toBeVisible();
    await page.getByRole("slider").last().click();
    await page.getByRole("button", { name: "Submit" }).click();
  }

  // JellyBeans Stage 2
  for (let i = 0; i < playerPages.length; i++) {
    const page = playerPages[i];

    await expect(page.getByText("Result").first()).toBeVisible();
    await page.getByRole("button", { name: "Submit" }).click();
  }

  // Minesweeper
  for (let i = 0; i < playerPages.length; i++) {
    const page = playerPages[i];

    await expect(page.getByText("Round 2 - Minesweeper")).toBeVisible();
    await page.getByRole("button", { name: "I'm done!" }).click();
  }

  // Exit Survey
  for (let i = 0; i < playerPages.length; i++) {
    const page = playerPages[i];

    await expect(page.locator("#root")).toContainText(
      "Your final bonus is in addition"
    );
    await expect(
      page.getByRole("heading", { name: "Exit Survey" })
    ).toBeVisible();
    await page.locator("#age").click();
    await page.locator("#age").fill("10");
    await page.locator("#gender").click();
    await page.locator("#gender").fill("M");
    await page.getByText("High School").click();
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByRole("heading", { name: "Finished" })).toBeVisible();
  }

  // check batch is ended
  await expect(adminPage.getByText("Running")).toHaveCount(0);
});
