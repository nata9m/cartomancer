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
  // A plain page behind the header: no contour or compass drawing (#102).
  const behind = await page.evaluate(() => {
    const main = document.querySelector('main') as Element;
    const before = getComputedStyle(main, '::before');
    return { content: before.content, mask: before.maskImage || before.webkitMaskImage || 'none' };
  });
  expect(behind.content).toBe('none');
  expect(behind.mask).toBe('none');
  // The quiz cards are the plain cards, with no learned count (that lives in the
  // stats strip) and no tarot styling (#94, #101).
  await expect(page.locator('.card-number')).toHaveCount(0);
  await expect(page.locator('.card--tarot')).toHaveCount(0);
  await expect(page.locator('.stack > a.card .card-chevron')).toHaveCount(5);
  // A single thin border, flat background and 8px corners, as before #57.
  const capitals = page.locator('.stack > a.card', { hasText: 'Capitals' });
  const style = await capitals.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      border: cs.borderTopWidth,
      radius: cs.borderTopLeftRadius,
      image: cs.backgroundImage,
      shadow: cs.boxShadow,
    };
  });
  expect(style.radius).toBe('8px');
  expect(style.image).toBe('none');
  expect(style.shadow).toBe('none');
  expect(parseFloat(style.border)).toBeLessThanOrEqual(1);
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

test('the theme is Light or Dark, Light by default, and the OS has no say (#92)', async ({
  page,
  context,
  request,
}) => {
  // A dark OS must not make the app dark.
  await page.emulateMedia({ colorScheme: 'dark' });
  await continueAsGuest(page);
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const html = page.locator('html');

  // Two segments only, and no "System".
  await expect(page.getByRole('radio')).toHaveCount(2);
  await expect(page.getByRole('radio', { name: 'System' })).toHaveCount(0);

  // The two segments split the bar evenly, with no empty third (#105).
  const bar = await page.locator('.theme-toggle').boundingBox();
  const light = await page.getByRole('radio', { name: 'Light' }).boundingBox();
  const dark = await page.getByRole('radio', { name: 'Dark' }).boundingBox();
  expect(Math.abs((light?.width ?? 0) - (dark?.width ?? 1))).toBeLessThan(1);
  expect((light?.x ?? 0) + (light?.width ?? 0) + 2).toBeCloseTo(dark?.x ?? 0, 0);
  // The right edge of Dark is the bar's right edge less its padding and border.
  expect(
    Math.abs((dark?.x ?? 0) + (dark?.width ?? 0) + 2.5 - ((bar?.x ?? 0) + (bar?.width ?? 0))),
  ).toBeLessThan(1);

  // The default is Light: grey page, whatever the OS says.
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('radio', { name: 'Light' })).toBeChecked();
  expect(await background()).toBe('rgb(247, 247, 245)');

  // No serif anywhere: the title and the quiz prompt use the body's sans-serif.
  const fontOf = (selector: string) =>
    page.evaluate(
      (sel) => getComputedStyle(document.querySelector(sel) as Element).fontFamily,
      selector,
    );
  const bodyFont = await fontOf('body');
  expect(bodyFont).toContain('sans-serif');
  expect(await fontOf('.app-title')).toBe(bodyFont);
  expect(await fontOf('.card-title')).toBe(bodyFont);

  // Choosing Dark: neutral charcoal, and it sticks in the cookie.
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await background()).toBe('rgb(23, 23, 26)');
  await expect
    .poll(async () => (await context.cookies()).find((c) => c.name === 'cartomancer-theme')?.value)
    .toBe('dark');

  // The cookie is what the server renders from: a request with no JavaScript gets
  // the theme in the first bytes (the "no flash"), and the matching chrome colour.
  const cookie = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  const served = await (await request.get('/', { headers: { cookie } })).text();
  expect(served).toMatch(/<html[^>]*data-theme="dark"/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#17171a');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();

  // And the quiz prompt is sans-serif too.
  await page.getByRole('link', { name: /^Capitals/ }).click();
  await page.getByRole('button', { name: /Pick the capital city of the country shown/ }).click();
  await page.waitForURL(/\/quiz\/guest-/);
  expect(await fontOf('.prompt-text')).toBe(bodyFont);

  // Back to Light.
  await page.goto('/');
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f7f7f5');
  expect(await background()).toBe('rgb(247, 247, 245)');
});

test('an old "system" cookie, or a junk one, gets Light (#92)', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const value of ['system', 'sepia']) {
    await context.addCookies([{ name: 'cartomancer-theme', value, url: 'http://localhost:13000' }]);
    await continueAsGuest(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  }
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
  // A phone held upright opens on a slice of the world, filling the height (#91).
  const opening = await widthOf();
  expect(opening).toBeLessThan(1000);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  expect(await widthOf()).toBeLessThan(opening);
  await page.getByRole('button', { name: 'Show the whole world' }).click();
  expect(await widthOf()).toBeCloseTo(1000, 0);

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

test('Countries recall accepts an exact name as it is typed, and waits on a prefix (#88)', async ({
  page,
}) => {
  await continueAsGuest(page);
  const start = async (region: string) => {
    await page.goto(`/recall?region=${region}`);
    await page.getByRole('button', { name: /^Play/ }).click();
    await page.waitForURL(/\/recall\/guest-/);
  };
  const input = page.locator('.answer-input');
  const count = page.locator('.recall-count');

  // An exact name needs no Enter: accepted, the box clears, the counter moves,
  // and focus stays in the box.
  await start('Asia');
  await expect(count).toHaveText('0');
  await input.pressSequentially('China');
  await expect(count).toHaveText('1');
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(page.locator('.pill', { hasText: 'China' })).toBeVisible();

  // An already-recalled name does not trigger the "already on your list" note
  // while typing; that stays for Enter.
  await input.pressSequentially('China');
  await page.waitForTimeout(900);
  await expect(count).toHaveText('1');
  await expect(page.locator('.inline-note')).not.toContainText('already');
  await input.press('Enter');
  await expect(page.locator('.inline-note')).toContainText('already on your list');
  await input.fill('');

  // Focus is back in the box after every kind of guess, with no click (#89).
  await input.pressSequentially('Nowhereland');
  await input.press('Enter');
  await expect(page.locator('.inline-note')).toContainText('No match');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await input.press('Enter');
  await expect(input).toBeFocused();

  // A typo is never accepted by itself, but Enter still takes it by fuzzy match.
  await start('Europe');
  await input.pressSequentially('Swizerland');
  await page.waitForTimeout(1000);
  await expect(count).toHaveText('0');
  await input.press('Enter');
  await expect(count).toHaveText('1');

  // "Niger" is also the start of Nigeria: typing on gets Nigeria, not Niger…
  await start('Africa');
  await input.pressSequentially('Niger');
  await input.pressSequentially('ia');
  await expect(count).toHaveText('1');
  await expect(page.locator('.pill', { hasText: 'Nigeria' })).toBeVisible();
  await expect(page.locator('.pill', { hasText: /^Niger$/ })).toHaveCount(0);

  // …and pausing after "Niger" accepts Niger.
  await input.pressSequentially('Niger');
  await expect(count).toHaveText('2');
  await expect(page.locator('.pill', { hasText: /^Niger$/ })).toBeVisible();
});

test('a guest sees no country twice until the whole pool has been seen (#96)', async ({ page }) => {
  await continueAsGuest(page);
  const asked: string[] = [];
  // Oceania has 14 countries: with rounds of the default size the pool is spent
  // inside one round, so play two short rounds from the picker and check the
  // second never repeats the first.
  for (let round = 0; round < 2; round += 1) {
    await page.goto('/capitals?region=Oceania');
    await page.getByRole('button', { name: /Pick the capital city of the country shown/ }).click();
    await page.waitForURL(/\/quiz\/guest-/);
    const total = Number((await page.locator('.progress-counter').innerText()).split('/')[1]);
    // Answer the first 6 only; the rest are abandoned, so they must not count as seen.
    for (let question = 1; question <= 6; question += 1) {
      asked.push((await page.locator('.prompt-text').innerText()).trim());
      await page.locator('.option').first().click();
      await page.getByRole('button', { name: /^(Next|See results)$/ }).click();
    }
    expect(total).toBeGreaterThanOrEqual(6);
  }
  // 12 answered across two rounds from a pool of 14: all different.
  expect(new Set(asked).size).toBe(12);
});

test('a wrong type-in answer that is another country adds no extra sentence (#93)', async ({
  page,
}) => {
  await continueAsGuest(page);
  await page.getByRole('link', { name: /^Flags/ }).click();
  await page.getByRole('button', { name: /Type the country a flag belongs to/ }).click();
  await page.waitForURL(/\/quiz\/guest-/);

  const input = page.locator('.answer-input');
  const reveal = page.locator('.result-row');
  // Almost always wrong on the first try; if the flag happens to be Chad's, move on.
  for (const guess of ['Chad', 'Peru', 'Japan']) {
    await input.fill(guess);
    await input.press('Enter');
    await expect(reveal).toBeVisible();
    if (!(await reveal.innerText()).includes('Correct')) break;
    await page.getByRole('button', { name: /^(Next|See results)$/ }).click();
  }

  // The result card names the right answer, and nothing explains the mistake.
  await expect(reveal).toHaveClass(/result-row--wrong/);
  await expect(page.locator('.feedback-note')).toHaveCount(0);
  await expect(page.getByRole('status')).not.toContainText('different country');
  await expect(page.getByRole('status')).toContainText(/^Wrong\. The answer is /);
});

test('the map fills the screen, re-fits on rotation and keeps the selection (#91)', async ({
  page,
}) => {
  await continueAsGuest(page);
  await page.getByRole('link', { name: /^Map/ }).click();
  await page.getByRole('button', { name: /Country → location/ }).click();
  await page.waitForURL(/\/quiz\/guest-/);
  await expect(page.locator('path.map-country')).toHaveCount(195);

  const frame = page.locator('.world-map');
  const sizeOf = async () => {
    const box = await frame.boundingBox();
    expect(box).toBeTruthy();
    return box as { x: number; y: number; width: number; height: number };
  };
  const viewport = () => page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const pageScrolls = () =>
    page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight + 1 || window.scrollY > 0,
    );

  // Phone, upright: most of the screen, edge to edge, nothing to scroll, and the
  // prompt and the button both on screen.
  let screen = await viewport();
  let box = await sizeOf();
  expect(box.height).toBeGreaterThanOrEqual(screen.h * 0.6);
  expect(box.width).toBeCloseTo(screen.w, 0);
  expect(await pageScrolls()).toBe(false);
  const confirm = page.getByRole('button', { name: /^(Confirm|Tap a country)$/ });
  const confirmBox = await confirm.boundingBox();
  expect((confirmBox?.y ?? 0) + (confirmBox?.height ?? 0)).toBeLessThanOrEqual(screen.h);
  await expect(page.locator('.prompt-text')).toBeInViewport();

  // A country in the opening view is a real target without any zooming.
  const kenya = await page.locator('path[data-iso="ke"]').boundingBox();
  expect(kenya?.width ?? 0).toBeGreaterThan(28);
  expect(kenya?.height ?? 0).toBeGreaterThan(28);

  // Select something, then turn the phone: the map re-fits, the selection stays.
  await page.locator('path[data-iso="ke"]').dispatchEvent('click');
  await expect(page.locator('path.map-country--selected')).toHaveAttribute('data-iso', 'ke');
  const before = await page.locator('.world-map__svg').getAttribute('viewBox');
  await page.setViewportSize({ width: screen.h, height: screen.w });
  await expect
    .poll(async () => page.locator('.world-map__svg').getAttribute('viewBox'))
    .not.toBe(before);
  screen = await viewport();
  box = await sizeOf();
  expect(box.width).toBeCloseTo(screen.w, 0);
  expect(box.height).toBeGreaterThan(screen.h * 0.4);
  await expect(page.locator('path.map-country--selected')).toHaveAttribute('data-iso', 'ke');
  const [vx, vy, vw, vh] = ((await page.locator('.world-map__svg').getAttribute('viewBox')) ?? '')
    .split(' ')
    .map(Number) as [number, number, number, number];
  expect(vx).toBeGreaterThanOrEqual(-1);
  expect(vw / vh).toBeCloseTo(box.width / box.height, 1);
  expect(vy).not.toBeNaN();

  // A desktop window uses its whole width, not the narrow column.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(async () => (await sizeOf()).width).toBeCloseTo(1280, 0);
  expect((await sizeOf()).height).toBeGreaterThanOrEqual(800 * 0.6);
  expect(await pageScrolls()).toBe(false);
  await expect(page.getByRole('button', { name: /^(Confirm|Tap a country)$/ })).toBeInViewport();
});

test('review is not a home card, and a guest sees none under any game (#108)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/to review/i)).toHaveCount(0);
  for (const game of ['capitals', 'flags', 'map', 'trivia']) {
    await page.goto(`/${game}`);
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page.getByText(/to review/i)).toHaveCount(0);
  }
});

test('the map says what the dots are, clear of the map and the buttons (#109)', async ({
  page,
}) => {
  await continueAsGuest(page);
  await page.getByRole('link', { name: /^Map/ }).click();
  await page.getByRole('button', { name: /Country → location/ }).click();
  await page.waitForURL(/\/quiz\/guest-/);

  const note = page.getByText('Dots mark small countries. Tap them like any other.');
  await expect(note).toBeVisible();
  await expect(page.locator('svg[aria-label*="Dots mark small countries"]')).toHaveCount(1);

  const noteBox = await note.boundingBox();
  const mapBox = await page.locator('.world-map').boundingBox();
  const confirmBox = await page
    .getByRole('button', { name: /^(Confirm|Tap a country)$/ })
    .boundingBox();
  expect((noteBox?.y ?? 0) + (noteBox?.height ?? 0)).toBeLessThanOrEqual(mapBox?.y ?? 0);
  expect((mapBox?.y ?? 0) + (mapBox?.height ?? 0)).toBeLessThanOrEqual(confirmBox?.y ?? 0);

  // A dot still selects its country.
  await page.locator('[data-iso-dot]').first().locator('.map-dot__hit').click({ force: true });
  await expect(page.getByRole('button', { name: 'Confirm' })).toBeEnabled();
});

test('revealing the answer does not move or rescale the map (#112)', async ({ page }) => {
  await continueAsGuest(page);
  await page.getByRole('link', { name: /^Map/ }).click();
  await page.getByRole('button', { name: /Country → location/ }).click();
  await page.waitForURL(/\/quiz\/guest-/);
  await expect(page.locator('path.map-country')).toHaveCount(195);

  const snapshot = async () => ({
    viewBox: await page.locator('svg.world-map__svg').getAttribute('viewBox'),
    frame: await page.locator('.world-map').boundingBox(),
    kenya: await page.locator('path[data-iso="ke"]').boundingBox(),
  });

  // A pick (right or wrong, whichever the question makes it) twice, then giving
  // up: each reveals different lines under the map, and none may move it.
  for (const how of ['pick', 'pick', 'give up'] as const) {
    if (how === 'pick') {
      await page.locator('path[data-iso="ke"]').click({ force: true });
    }
    // Zoom in, so a re-fit would show.
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    const before = await snapshot();

    if (how === 'pick') {
      await page.getByRole('button', { name: 'Confirm' }).click();
    } else {
      await page.getByRole('button', { name: /I don.t know/ }).click();
    }
    const next = page.getByRole('button', { name: /^(Next|See results)$/ });
    await expect(next).toBeVisible();
    await page.waitForTimeout(400);
    const after = await snapshot();

    // Nothing moves or rescales: the view starts at the same map point and has the
    // same width (so the same scale). A reveal with a feedback line may take a few
    // pixels off the frame's bottom edge, never more room than it had.
    const [bx, by, bw, bh] = (before.viewBox ?? '').split(' ').map(Number) as number[];
    const [ax, ay, aw, ah] = (after.viewBox ?? '').split(' ').map(Number) as number[];
    expect(ax, `${how}: view x`).toBeCloseTo(bx as number, 6);
    expect(ay, `${how}: view y`).toBeCloseTo(by as number, 6);
    expect(aw, `${how}: view width`).toBeCloseTo(bw as number, 6);
    expect(ah as number, `${how}: view height`).toBeLessThanOrEqual((bh as number) + 1e-6);
    expect(after.frame?.y, `${how}: frame top`).toBe(before.frame?.y);
    expect(after.frame?.width, `${how}: frame width`).toBe(before.frame?.width);
    expect(after.frame?.height ?? 0, `${how}: frame height`).toBeLessThanOrEqual(
      (before.frame?.height ?? 0) + 0.5,
    );
    // The highlight is a thicker outline, so the box may grow by a pixel; its
    // centre is where the country is, and that must not move.
    const centre = (box: { x: number; y: number; width: number; height: number } | null) => ({
      x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
      y: (box?.y ?? 0) + (box?.height ?? 0) / 2,
    });
    expect(centre(after.kenya).x, `${how}: Kenya x`).toBeCloseTo(centre(before.kenya).x, 0);
    expect(centre(after.kenya).y, `${how}: Kenya y`).toBeCloseTo(centre(before.kenya).y, 0);
    await expect(next).toBeInViewport();
    await next.click();
  }
});

test('the map zooms in far enough to tap the smallest countries on a phone (#113)', async ({
  page,
}) => {
  await continueAsGuest(page);
  await page.getByRole('link', { name: /^Map/ }).click();
  await page.getByRole('button', { name: /Country → location/ }).click();
  await page.waitForURL(/\/quiz\/guest-/);
  await expect(page.locator('path.map-country')).toHaveCount(195);

  const sizeOf = async (iso: string) => {
    const box = await page.locator(`path[data-iso="${iso}"]`).boundingBox();
    return { width: box?.width ?? 0, height: box?.height ?? 0 };
  };
  // Before: the Balkans are a few pixels across on a phone.
  expect((await sizeOf('me')).width).toBeLessThan(15);

  // Wheel in about Albania until the + button gives out.
  const albania = await page.locator('path[data-iso="al"]').boundingBox();
  await page.mouse.move(
    (albania?.x ?? 0) + (albania?.width ?? 0) / 2,
    (albania?.y ?? 0) + (albania?.height ?? 0) / 2,
  );
  for (let notch = 0; notch < 40; notch += 1) await page.mouse.wheel(0, -100);
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeDisabled();

  // Small, crowded countries are now a fingertip or more in both directions.
  for (const iso of ['me', 'mk', 'rw', 'dj']) {
    const { width, height } = await sizeOf(iso);
    expect(Math.min(width, height), iso).toBeGreaterThan(44);
  }

  // And the whole world is still one tap away.
  await page.getByRole('button', { name: 'Show the whole world' }).click();
  await expect(page.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeEnabled();
});
