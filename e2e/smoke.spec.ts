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
  // The fuzzy accept says what was typed and what the spelling is (#53).
  await expect(page.locator('.feedback-note--close')).toContainText(
    `Close — you typed ${typo}, it’s spelled ${capital}`,
  );
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

test('quiz screens are accessible: progress bar, announced reveal, focus on Next (#56)', async ({
  page,
}) => {
  await continueAsGuest(page);
  await page.getByRole('link', { name: /^Capitals/ }).click();
  await page.getByRole('button', { name: /Pick the capital city of the country shown/ }).click();
  await page.waitForURL(/\/quiz\/guest-/);

  const bar = page.getByRole('progressbar', { name: 'Quiz progress' });
  await expect(bar).toHaveAttribute('aria-valuenow', '0');
  await expect(bar).toHaveAttribute('aria-valuemin', '0');
  const total = await bar.getAttribute('aria-valuemax');
  expect(Number(total)).toBeGreaterThan(0);

  const live = page.getByRole('status');
  await expect(live).toHaveText('');
  await page.locator('.option').first().click();

  await expect(live).toHaveText(/^(Correct, |Wrong\. The answer is ).+/);
  await expect(bar).toHaveAttribute('aria-valuenow', '1');
  await expect(bar).toHaveAttribute('aria-valuetext', `1 of ${total} answered`);
  await expect(page.getByRole('button', { name: /^(Next|See results)$/ })).toBeFocused();

  if (Number(total) > 1) {
    await page.keyboard.press('Enter');
    await expect(live).toHaveText('');
    await expect(page.locator('.prompt')).toBeFocused();
  }
});

test('reduced motion turns every quiz animation off (#56)', async ({ page }) => {
  await continueAsGuest(page);
  await page.getByRole('link', { name: /^Capitals/ }).click();
  await page.getByRole('button', { name: /Pick the capital city of the country shown/ }).click();
  await page.waitForURL(/\/quiz\/guest-/);

  const animationOf = async () => {
    await page.locator('.option').first().click();
    return page.locator('.option--correct').evaluate((el) => getComputedStyle(el).animationName);
  };

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await animationOf()).toBe('none');

  await page.getByRole('button', { name: /^(Next|See results)$/ }).click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await animationOf()).toBe('option-pop');
});

test('type-in hints and a wrong-country notice (#53)', async ({ page, request }) => {
  const response = await request.get('/bff/countries?region=all');
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
  const asked = capitalOf.get((await page.locator('.prompt-text').innerText()).trim()) as string;
  expect(asked).toBeTruthy();

  // Question 1: take the hint, then answer correctly. It is correct, and says
  // it did not count.
  await expect(page.locator('.answer-hint')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show a hint' }).click();
  const hint = page.locator('.answer-hint');
  await expect(hint).toHaveText(
    new RegExp(`^${asked.charAt(0)}( |_|-|'|\\.)*$`.replace('(', '(?:'), 'u'),
  );
  await expect(page.getByRole('button', { name: 'Show a hint' })).toHaveCount(0);
  await input.fill(asked);
  await expect(page.locator('.result-row')).toContainText('Correct');
  await expect(page.locator('.feedback-note--hinted')).toContainText('does not count');
  await page.getByRole('button', { name: /^(Next|See results)$/ }).click();

  // Question 2: another country's capital is a wrong answer that says so.
  const second = capitalOf.get((await page.locator('.prompt-text').innerText()).trim()) as string;
  const other = countries.find(
    (country) =>
      country.capital !== second &&
      country.capital.length >= 6 &&
      everyCapital.filter((capital) => capital === country.capital).length === 1,
  );
  expect(other).toBeTruthy();
  await input.fill(other?.capital ?? '');
  await input.press('Enter');
  await expect(page.locator('.result-row')).toContainText(second);
  await expect(page.locator('.feedback-note--other')).toContainText(
    `${other?.capital} is the capital of ${other?.name} — the answer was ${second}`,
  );
});

test('a guest can practise exactly the countries they missed (#51)', async ({ page }) => {
  await continueAsGuest(page);
  await page.getByRole('link', { name: /^Capitals/ }).click();
  await page.getByRole('button', { name: /Type the capital city of the country shown/ }).click();
  await page.waitForURL(/\/quiz\/guest-/);

  const counter = page.locator('.progress-counter');
  const total = Number((await counter.innerText()).split('/')[1]);

  // Give up on every question, so the missed list is the whole round and the
  // drill has a known size.
  for (let question = 1; question <= total; question += 1) {
    await page.getByRole('button', { name: /don.t know/i }).click();
    await page.getByRole('button', { name: question === total ? 'See results' : 'Next' }).click();
  }

  await page.waitForURL(/\/results/);
  const missed = await page.locator('.missed-row').count();
  expect(missed).toBe(total);
  const missedPrompts = await page.locator('.missed-row').allInnerTexts();

  await page.getByRole('button', { name: new RegExp(`Practise these ${total} again`) }).click();
  await page.waitForURL(/\/quiz\/guest-/);
  await expect(counter).toHaveText(`1/${total}`);

  // The drill asks about the missed countries and nothing else.
  const asked = new Set<string>();
  for (let question = 1; question <= total; question += 1) {
    asked.add((await page.locator('.prompt-text').innerText()).trim());
    await page.getByRole('button', { name: /don.t know/i }).click();
    await page.getByRole('button', { name: question === total ? 'See results' : 'Next' }).click();
  }
  expect(asked.size).toBe(total);
  for (const prompt of missedPrompts) {
    expect(prompt).toContain([...asked].find((name) => prompt.includes(name)) ?? '\u0000');
  }
});

test('the theme can be chosen, sticks without a flash, and wins over the OS (#57)', async ({
  page,
  context,
  request,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await continueAsGuest(page);
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const html = page.locator('html');

  // System follows the OS: no attribute, and the dark palette from the media query.
  await expect(html).not.toHaveAttribute('data-theme', /.*/);
  expect(await background()).toBe('rgb(18, 22, 31)');

  // Pinning light beats a dark OS.
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await background()).toBe('rgb(245, 240, 228)');
  await expect(page.getByRole('radio', { name: 'Light' })).toBeChecked();

  // The cookie is what the server renders from: a request with no JavaScript at
  // all gets the theme in the first bytes, which is the "no flash".
  await expect
    .poll(async () => (await context.cookies()).find((c) => c.name === 'cartomancer-theme')?.value)
    .toBe('light');
  const cookie = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  const served = await request.get('/', { headers: { cookie } });
  expect(await served.text()).toMatch(/<html[^>]*data-theme="light"/);

  // And so does the browser chrome colour.
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f5f0e4');

  // Pinning dark, on a light OS.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await background()).toBe('rgb(18, 22, 31)');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();

  // Back to System: the attribute goes, and the OS decides again.
  await page.getByRole('radio', { name: 'System' }).click();
  await expect(html).not.toHaveAttribute('data-theme', /.*/);
  expect(await background()).toBe('rgb(245, 240, 228)');
});

test('a guest plays a map round: select, confirm, and see where it was (#52)', async ({
  page,
  request,
}) => {
  const response = await request.get('/bff/countries?region=all');
  const { countries } = (await response.json()) as {
    countries: { name: string; isoCode: string }[];
  };
  const isoOf = new Map(countries.map((country) => [country.name, country.isoCode.toLowerCase()]));

  await continueAsGuest(page);
  await page.getByRole('link', { name: /^Map/ }).click();
  await page.getByRole('button', { name: /Country → location/ }).click();
  await page.waitForURL(/\/quiz\/guest-/);

  const map = page.locator('.world-map__svg');
  await expect(map).toBeVisible();
  // The geometry is loaded on demand: the countries appear once it has arrived.
  await expect(page.locator('.map-country')).toHaveCount(195);
  const confirm = page.getByRole('button', { name: /^(Confirm|Tap a country)$/ });
  await expect(confirm).toBeDisabled();

  const asked = async () => {
    const name = (await page.locator('.prompt-text').innerText()).trim();
    const iso = isoOf.get(name);
    expect(iso, `no country called ${name}`).toBeTruthy();
    return { name, iso: iso as string };
  };
  // A click straight on the element: where a country's middle is on screen can
  // be somebody else's land (Chile, Norway), and the geometry is not what is
  // being tested here.
  const tap = (iso: string) => page.locator(`path[data-iso="${iso}"]`).dispatchEvent('click');

  // 1. Zooming in and out and back to the world.
  const widthOf = async () => Number(((await map.getAttribute('viewBox')) ?? '').split(' ')[2]);
  expect(await widthOf()).toBe(1000);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  expect(await widthOf()).toBeLessThan(1000);
  await page.getByRole('button', { name: 'Show the whole world' }).click();
  expect(await widthOf()).toBe(1000);

  // A drag moves the map and must not select the country it started on, even
  // though the click that ends it lands on one.
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  const frame = await map.boundingBox();
  expect(frame).toBeTruthy();
  const viewBefore = await map.getAttribute('viewBox');
  const centre = {
    x: (frame?.x ?? 0) + (frame?.width ?? 0) / 2,
    y: (frame?.y ?? 0) + (frame?.height ?? 0) / 2,
  };
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x - 60, centre.y - 20, { steps: 6 });
  await page.mouse.up();
  expect(await map.getAttribute('viewBox')).not.toBe(viewBefore);
  await expect(page.locator('path.map-country--selected')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show the whole world' }).click();

  // 2. The right country: selected, confirmed, shown in green.
  const first = await asked();
  await tap(first.iso);
  await expect(page.locator('path.map-country--selected')).toHaveAttribute('data-iso', first.iso);
  await expect(page.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.locator('.result-row')).toContainText('Correct');
  await expect(page.locator('path.map-country--correct')).toHaveAttribute('data-iso', first.iso);
  await page.getByRole('button', { name: /^(Next|See results)$/ }).click();

  // 3. A wrong one: the reveal shows the right country and says what was tapped.
  const second = await asked();
  const other = countries.find((country) => country.isoCode.toLowerCase() !== second.iso);
  expect(other).toBeTruthy();
  const otherIso = (other?.isoCode ?? '').toLowerCase();
  await tap(otherIso);
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.locator('.result-row')).toContainText(second.name);
  await expect(page.locator('path.map-country--correct')).toHaveAttribute('data-iso', second.iso);
  await expect(page.locator('path.map-country--wrong')).toHaveAttribute('data-iso', otherIso);
  await expect(page.locator('.feedback-note--other')).toContainText(`That was ${other?.name}`);
  await page.getByRole('button', { name: /^(Next|See results)$/ }).click();

  // 4. Nothing selected means nothing to confirm; giving up is still possible.
  await expect(page.locator('path.map-country--selected')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tap a country' })).toBeDisabled();
  await page.getByRole('button', { name: /don.t know/i }).click();
  await expect(page.locator('.result-row')).toBeVisible();
  await expect(page.locator('path.map-country--wrong')).toHaveCount(0);
});
