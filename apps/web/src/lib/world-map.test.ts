import { COUNTRIES } from '@cartomancer/shared';
import { describe, expect, it } from 'vitest';
import { WORLD_MAP } from './world-map-data';
import {
  clampCamera,
  containScale,
  coverScale,
  initialCamera,
  keepView,
  MAX_ZOOM,
  panBy,
  scaleOf,
  viewBoxOf,
  viewOf,
  worldCamera,
  zoomAt,
} from './world-map';

const map = { width: 1000, height: 520 };
const phone = { width: 390, height: 560 };
const desktop = { width: 1280, height: 720 };
const landscapePhone = { width: 760, height: 330 };

describe('the world map data', () => {
  it('has exactly one outline for each of the 195 countries', () => {
    const wanted = COUNTRIES.map((country) => country.isoCode.toLowerCase()).sort();
    const have = WORLD_MAP.countries.map((country) => country.iso).sort();
    expect(have).toEqual(wanted);
    expect(new Set(have).size).toBe(195);
  });

  it('names each one as the app does', () => {
    for (const country of COUNTRIES) {
      const outline = WORLD_MAP.countries.find((o) => o.iso === country.isoCode.toLowerCase());
      expect(outline?.name, country.isoCode).toBe(country.name);
    }
  });

  it('draws every outline, inside the map', () => {
    for (const country of WORLD_MAP.countries) {
      expect(country.d, country.iso).toMatch(/^M/);
      expect(country.cx, country.iso).toBeGreaterThanOrEqual(0);
      expect(country.cx, country.iso).toBeLessThanOrEqual(WORLD_MAP.width);
      expect(country.cy, country.iso).toBeGreaterThanOrEqual(0);
      expect(country.cy, country.iso).toBeLessThanOrEqual(WORLD_MAP.height);
    }
  });

  it('marks the specks as tiny, and the big countries as not', () => {
    const tiny = new Set(WORLD_MAP.countries.filter((c) => c.tiny).map((c) => c.iso));
    for (const iso of ['va', 'mc', 'sm', 'li', 'mt', 'sg', 'mv', 'nr', 'tv']) {
      expect(tiny.has(iso), iso).toBe(true);
    }
    for (const iso of ['ru', 'br', 'us', 'cn', 'au', 'fr', 'de']) {
      expect(tiny.has(iso), iso).toBe(false);
    }
  });
});

describe('fitting the map to a frame (#91)', () => {
  it('has the whole world fit at contain scale, and cover the frame at cover scale', () => {
    expect(containScale(map, phone)).toBeCloseTo(0.39);
    expect(coverScale(map, phone)).toBeCloseTo(560 / 520);
    expect(containScale(map, desktop)).toBeCloseTo(1.28);
    expect(coverScale(map, desktop)).toBeCloseTo(720 / 520);
  });

  it('opens a phone held upright on a slice at the full height, not a postage stamp', () => {
    const camera = initialCamera(map, phone);
    const view = viewOf(camera, map, phone);
    expect(view.h).toBeCloseTo(520);
    expect(view.w).toBeLessThan(400);
    // About three times the size a country would be with the world squeezed to the width.
    expect(scaleOf(camera, map, phone)).toBeGreaterThan(2.5 * 0.39);
    // Centred on a neutral spot, not on any one answer.
    expect(view.x + view.w / 2).toBeCloseTo(520);
  });

  it('opens a desktop window on the whole world, edge to edge', () => {
    const view = viewOf(initialCamera(map, desktop), map, desktop);
    expect(view.w).toBeCloseTo(1000);
    expect(view.x).toBeGreaterThanOrEqual(-1e-9);
    expect(view.x + view.w).toBeLessThanOrEqual(1000 + 1e-9);
  });

  it("always draws in the frame's own proportions, so nothing is stretched", () => {
    for (const box of [phone, desktop, landscapePhone]) {
      for (const camera of [initialCamera(map, box), worldCamera(map)]) {
        const view = viewOf(camera, map, box);
        expect(view.w / view.h).toBeCloseTo(box.width / box.height);
      }
    }
  });

  it('shows the whole world at k = 1, with the spare height split evenly', () => {
    const view = viewOf(worldCamera(map), map, phone);
    expect(view.w).toBeCloseTo(1000);
    expect(view.x).toBeCloseTo(0);
    expect(view.y + view.h / 2).toBeCloseTo(260);
    expect(viewBoxOf(view)).toContain('1000');
  });
});

describe('re-fitting when the frame changes (#91)', () => {
  it('keeps the place and the zoom when a phone is turned on its side', () => {
    const camera = zoomAt(initialCamera(map, phone), 3, { x: 560, y: 300 }, map, phone);
    const before = viewOf(camera, map, phone);
    const after = viewOf(camera, map, landscapePhone);
    expect(after.x + after.w / 2).toBeCloseTo(before.x + before.w / 2, 0);
    expect(after.y + after.h / 2).toBeCloseTo(before.y + before.h / 2, 0);
    expect(after.w / after.h).toBeCloseTo(landscapePhone.width / landscapePhone.height);
  });

  it('stays on the map whatever the frame', () => {
    for (const box of [phone, desktop, landscapePhone]) {
      const camera = panBy(initialCamera(map, box), 5000, -5000, map, box);
      const view = viewOf(camera, map, box);
      if (view.w < map.width) {
        expect(view.x).toBeGreaterThanOrEqual(-1e-9);
        expect(view.x + view.w).toBeLessThanOrEqual(map.width + 1e-9);
      }
      if (view.h < map.height) {
        expect(view.y).toBeGreaterThanOrEqual(-1e-9);
        expect(view.y + view.h).toBeLessThanOrEqual(map.height + 1e-9);
      }
    }
  });
});

describe('keeping the view when the frame settles (#112)', () => {
  it("keeps the scale and the point under the frame's corner when it shrinks", () => {
    const shorter = { width: phone.width, height: phone.height - 23 };
    const camera = zoomAt(initialCamera(map, phone), 3, { x: 560, y: 300 }, map, phone);
    const before = viewOf(camera, map, phone);
    const kept = keepView(camera, map, phone, shorter);
    const after = viewOf(kept, map, shorter);
    expect(scaleOf(kept, map, shorter)).toBeCloseTo(scaleOf(camera, map, phone), 6);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(after.w).toBeCloseTo(before.w, 6);
  });

  it('does the same when the frame grows, and stays on the map', () => {
    const taller = { width: phone.width, height: phone.height + 40 };
    const camera = zoomAt(initialCamera(map, phone), 5, { x: 300, y: 200 }, map, phone);
    const before = viewOf(camera, map, phone);
    const kept = keepView(camera, map, phone, taller);
    const after = viewOf(kept, map, taller);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(after.y + after.h).toBeLessThanOrEqual(map.height + 1e-9);
  });
});

describe('zoomAt', () => {
  it('keeps the point under the cursor where it was', () => {
    const start = initialCamera(map, desktop);
    const point = { x: 600, y: 200 };
    const before = viewOf(start, map, desktop);
    const after = viewOf(zoomAt(start, 2, point, map, desktop), map, desktop);
    expect((point.x - after.x) / after.w).toBeCloseTo((point.x - before.x) / before.w);
    expect((point.y - after.y) / after.h).toBeCloseTo((point.y - before.y) / before.h);
    expect(after.w).toBeCloseTo(before.w / 2);
  });

  it('cannot zoom out past the whole world', () => {
    expect(zoomAt(worldCamera(map), 0.1, { x: 500, y: 260 }, map, phone).k).toBe(1);
  });

  it('cannot zoom in past the maximum', () => {
    let camera = initialCamera(map, phone);
    for (let step = 0; step < 40; step += 1) {
      camera = zoomAt(camera, 2, { x: 520, y: 260 }, map, phone);
    }
    expect(camera.k).toBeCloseTo(MAX_ZOOM);
  });

  it('stays on the map when zooming at a corner', () => {
    const start = initialCamera(map, desktop);
    const view = viewOf(zoomAt(start, 4, { x: 1000, y: 520 }, map, desktop), map, desktop);
    expect(view.x + view.w).toBeLessThanOrEqual(1000 + 1e-9);
    expect(view.y + view.h).toBeLessThanOrEqual(520 + 1e-9);
  });
});

describe('panBy', () => {
  it('moves the view by a distance in map units', () => {
    const start = zoomAt(initialCamera(map, desktop), 4, { x: 500, y: 260 }, map, desktop);
    const moved = panBy(start, 30, -20, map, desktop);
    expect(moved.cx).toBeCloseTo(start.cx + 30);
    expect(moved.cy).toBeCloseTo(start.cy - 20);
  });

  it('can reach both edges of the land when zoomed in on a phone', () => {
    const start = zoomAt(initialCamera(map, phone), 3, { x: 500, y: 260 }, map, phone);
    const left = viewOf(panBy(start, -5000, 0, map, phone), map, phone);
    const right = viewOf(panBy(start, 5000, 0, map, phone), map, phone);
    expect(left.x).toBeCloseTo(0);
    expect(right.x + right.w).toBeCloseTo(1000);
  });

  it('has nowhere to go when the whole world is in view', () => {
    const world = worldCamera(map);
    expect(panBy(world, 100, 100, map, desktop)).toEqual(clampCamera(world, map, desktop));
  });
});

describe('clampCamera', () => {
  it('repairs a camera that is too close, too far, or off the map', () => {
    const fixed = clampCamera({ cx: -50, cy: 9999, k: 99 }, map, phone);
    expect(fixed.k).toBe(MAX_ZOOM);
    expect(clampCamera({ cx: 0, cy: 0, k: 0.01 }, map, phone).k).toBe(1);
    const view = viewOf(fixed, map, phone);
    expect(view.x).toBeGreaterThanOrEqual(-1e-9);
    expect(view.y + view.h).toBeLessThanOrEqual(520 + 1e-9);
  });
});
