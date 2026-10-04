import { expect, type Page, test } from '@playwright/test';

/**
 * Smoke tests (#55): a guest plays, and the whole path from the login screen to
 * the results — web, proxy, api, matching — has to hold together.
 */

/** Edit distance, for choosing a typo the api has no reason to doubt. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0] as number;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j] as number;
      row[j] = Math.min(
        above + 1,
        (row[j - 1] as number) + 1,
        previous + (a[i - 1]?.toLowerCase() === b[j - 1]?.toLowerCase() ? 0 : 1),
      );
      previous = above;
    }
  }
  return row[b.length] as number;
}

/** Skips sign-in, which is how a guest gets to the home screen. */
async function continueAsGuest(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('heading', { name: 'Cartomancer' })).toBeVisible();
  // The guest home, not the signed-in one.
  await expect(page.locator('.signin-banner')).toBeVisible();
}

test('a guest plays a Capitals multiple-choice round through to the results', async ({ page }) => {
  await continueAsGuest(page);
  await page.getByRole('link', { name: /^Capitals/ }).click();
  await page.getByRole('button', { name: /Pick the capital city of the country shown/ }).click();
  await page.waitForURL(/\/quiz\/guest-/);

  const counter = page.locator('.progress-counter');
  await expect(counter).toHaveText(/^1\/\d+$/);
  const total = Number((await counter.innerText()).split('/')[1]);
  expect(total).toBeGreaterThan(0);

  let correct = 0;
  for (let question = 1; question <= total; question += 1) {
    await expect(counter).toHaveText(`${question}/${total}`);
    await expect(page.locator('.option')).toHaveCount(4);

    await page.locator('.option').first().click();
    // The reveal always marks the right answer; the tapped one is only marked
    // wrong when it was.
    await expect(page.locator('.option--correct')).toHaveCount(1);
    if ((await page.locator('.option--wrong').count()) === 0) correct += 1;

    await page.getByRole('button', { name: question === total ? 'See results' : 'Next' }).click();
  }

  await page.waitForURL(/\/quiz\/guest-[^/]+\/results$/);
  // The score on screen is the score of the answers just given.
  await expect(page.locator('.results-score')).toHaveText(`${correct}/${total}`);
  await expect(page.getByRole('button', { name: /Play again/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();
});

test('a guest type-in round: an exact answer accepts itself, a typo waits for Enter', async ({
  page,
  request,
}) => {
  // The answers come from the same reference data the api judges against.
  const response = await request.get('/bff/countries?region=all');
  expect(response.ok()).toBe(true);
  const { countries } = (await response.json()) as {
    countries: { name: string; capital: string; capitalAliases: string[] }[];
  };
  const capitalOf = new Map(countries.map((country) => [country.name, country.capital]));
  const everyCapital = countries.flatMap((country) => [country.capital, ...country.capitalAliases]);

  await continueAsGuest(page);
  await page.getByRole('link', { name: /^Capitals/ }).click();
  await page.getByRole('button', { name: /Type the capital city of the country shown/ }).click();
  await page.waitForURL(/\/quiz\/guest-/);

  const input = page.locator('.answer-input');
  const prompt = page.locator('.prompt-text');
  const reveal = page.locator('.result-row');

  /** The capital being asked for now. */
  const asked = async (): Promise<string> => {
    const country = (await prompt.innerText()).trim();
    const capital = capitalOf.get(country);
    expect(capital, `no capital known for ${country}`).toBeTruthy();
    return capital as string;
  };

  /** Drops the second-to-last letter: "Budapest" → "Budapet". */
  const typoOf = (capital: string): string => capital.slice(0, -2) + capital.slice(-1);

  // The api forgives a typo only when it points at one country. "Kingstwn" is
  // meant for Kingstown (St Vincent) but is nearer Kingston (Jamaica), so it is
  // — correctly — not accepted. Which country is asked about is random, so the
  // test picks one whose typo has no near neighbour among the other capitals,
  // and is long enough to lose a letter and stay itself, rather than hoping.
  const typoIsUnambiguous = (capital: string): boolean =>
    capital.length >= 8 &&
    everyCapital
      .filter((other) => other !== capital)
      .every((other) => distance(typoOf(capital), other) >= 3);

  for (let skipped = 0; !typoIsUnambiguous(await asked()); skipped += 1) {
    expect(skipped, 'ran out of questions with an unambiguous capital').toBeLessThan(15);
    await page.getByRole('button', { name: /don.t know/i }).click();
    await page.getByRole('button', { name: 'Next' }).click();
  }

  // 1. A typo is not accepted while it is being typed…
  const capital = await asked();
  const typo = typoOf(capital);
  await input.fill(typo);
  await page.waitForTimeout(700); // well past the auto-accept debounce
  await expect(reveal).toHaveCount(0);
  // …but Enter hands it to the api, whose fuzzy matching forgives it.
  await input.press('Enter');
  await expect(reveal).toContainText('Correct');
  await page.getByRole('button', { name: 'Next' }).click();

  // 2. An exact answer accepts itself: no Enter, no Check answer (#69).
  await input.fill(await asked());
  await expect(reveal).toContainText('Correct');
});

test('a guest has no account page: it sends them to sign in', async ({ page }) => {
  await continueAsGuest(page);
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login$/);
});
