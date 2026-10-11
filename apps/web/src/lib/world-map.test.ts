import { COUNTRIES } from '@cartomancer/shared';
import { describe, expect, it } from 'vitest';
import { WORLD_MAP } from './world-map-data';
import {
  clampCamera,
  containScale,
  copiesIn,
  coverScale,
  initialCamera,
  keepView,
  MAX_SCALE,
  maxZoomFor,
  MIN_MAX_ZOOM,
  OPENING_HEIGHT_SHARE,
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
    // The opening view shows most of the height, not the polar edges (#114).
    expect(view.h).toBeCloseTo(520 * OPENING_HEIGHT_SHARE);
    expect(view.w).toBeLessThan(400);
    // About three times the size a country would be with the world squeezed to the width.
    expect(scaleOf(camera, map, phone)).toBeGreaterThan(2.5 * 0.39);
    // Centred on a neutral spot, not on any one answer.
    expect(view.x + view.w / 2).toBeCloseTo(520);
  });

  it('opens a desktop window on most of the world, not a slice', () => {
    const view = viewOf(initialCamera(map, desktop), map, desktop);
    // The world repeats sideways (#114), so there is no edge to be "edge to edge"
    // with; a wide window just shows most of one turn.
    expect(view.w).toBeGreaterThan(0.7 * map.width);
    expect(view.w).toBeLessThanOrEqual(map.width + 1e-9);
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

  it('stays between the poles whatever the frame, and keeps the centre in one copy', () => {
    for (const box of [phone, desktop, landscapePhone]) {
      const camera = panBy(initialCamera(map, box), 5000, -5000, map, box);
      const view = viewOf(camera, map, box);
      expect(camera.cx).toBeGreaterThanOrEqual(0);
      expect(camera.cx).toBeLessThan(map.width);
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
    expect(camera.k).toBeCloseTo(maxZoomFor(map, phone));
  });

  it('allows the same sharpness on any screen, not the same multiple (#113)', () => {
    for (const box of [phone, landscapePhone, desktop]) {
      let camera = initialCamera(map, box);
      for (let step = 0; step < 60; step += 1) {
        camera = zoomAt(camera, 1.5, { x: 520, y: 260 }, map, box);
      }
      expect(scaleOf(camera, map, box)).toBeGreaterThanOrEqual(
        Math.min(MAX_SCALE, MIN_MAX_ZOOM * containScale(map, box)) - 1e-9,
      );
    }
    // On a phone that is far more than 14x: enough to make Fiji a fingertip wide.
    expect(maxZoomFor(map, phone)).toBeGreaterThan(40);
    expect(maxZoomFor(map, phone) * containScale(map, phone)).toBeCloseTo(MAX_SCALE);
  });

  it('never allows less than it used to, on a big screen', () => {
    expect(maxZoomFor(map, { width: 3000, height: 2000 })).toBe(MIN_MAX_ZOOM);
  });

  it('stays between the poles when zooming at a corner', () => {
    const start = initialCamera(map, desktop);
    const view = viewOf(zoomAt(start, 4, { x: 1000, y: 520 }, map, desktop), map, desktop);
    expect(view.y + view.h).toBeLessThanOrEqual(520 + 1e-9);
  });

  it('keeps the point under the fingers put across the edge of the map (#114)', () => {
    // Looking at the seam: the camera is just inside the right edge, and the
    // point being pinched is on the far side of it, in the next copy.
    const camera = { cx: 990, cy: 260, k: 4 };
    const before = viewOf(camera, map, phone);
    const point = { x: before.x + before.w * 0.8, y: before.y + before.h * 0.4 };
    expect(point.x).toBeGreaterThan(1000);
    const after = viewOf(zoomAt(camera, 2, point, map, phone), map, phone);
    const fractionBefore = (point.x - before.x) / before.w;
    // The same point, in whichever copy the new camera is looking at.
    const fractions = [-1, 0, 1].map((copy) => (point.x + copy * 1000 - after.x) / after.w);
    expect(Math.min(...fractions.map((f) => Math.abs(f - fractionBefore)))).toBeLessThan(1e-9);
    expect((point.y - after.y) / after.h).toBeCloseTo(0.4);
  });
});

describe('panBy', () => {
  it('moves the view by a distance in map units', () => {
    const start = zoomAt(initialCamera(map, desktop), 4, { x: 500, y: 260 }, map, desktop);
    const moved = panBy(start, 30, -20, map, desktop);
    expect(moved.cx).toBeCloseTo(start.cx + 30);
    expect(moved.cy).toBeCloseTo(start.cy - 20);
  });

  it('keeps going past the edge of the map instead of stopping (#114)', () => {
    const start = zoomAt(initialCamera(map, phone), 3, { x: 990, y: 260 }, map, phone);
    const east = panBy(start, 5000, 0, map, phone);
    const west = panBy(start, -5000, 0, map, phone);
    // However far it is dragged, the centre is brought back into one copy ...
    for (const camera of [east, west]) {
      expect(camera.cx).toBeGreaterThanOrEqual(0);
      expect(camera.cx).toBeLessThan(map.width);
    }
    // ... and a drag of five whole worlds is the same view it started with.
    const lap = panBy(start, 5000, 0, map, phone);
    expect(lap.cx).toBeCloseTo(clampCamera(start, map, phone).cx);
  });

  it('lands on an equivalent view when a pan crosses the edge', () => {
    const start = clampCamera({ cx: 990, cy: 260, k: 4 }, map, phone);
    const moved = panBy(start, 30, 0, map, phone);
    expect(moved.cx).toBeCloseTo(20);
    const before = viewOf(start, map, phone);
    const after = viewOf(moved, map, phone);
    // 30 units further east, modulo a world.
    expect((after.x - before.x + 1000 + 500) % 1000).toBeCloseTo(530);
    expect(after.w).toBeCloseTo(before.w);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('pans the other way across the edge too', () => {
    const start = clampCamera({ cx: 10, cy: 260, k: 4 }, map, phone);
    expect(panBy(start, -30, 0, map, phone).cx).toBeCloseTo(980);
  });

  it('can still go round when the whole world is in view, but not up or down', () => {
    const world = worldCamera(map);
    expect(panBy(world, 0, 100, map, desktop)).toEqual(clampCamera(world, map, desktop));
    expect(panBy(world, 100, 0, map, desktop).cx).toBeCloseTo(600);
  });
});

describe('copiesIn (#114)', () => {
  const at = (x: number, w: number) => ({ x, y: 0, w, h: 100 });

  it('is just the original when the view is inside it', () => {
    expect(copiesIn(at(100, 300), map)).toEqual([0]);
    expect(copiesIn(at(0, 1000), map)).toEqual([0]);
  });

  it('adds the neighbour a view reaches into', () => {
    expect(copiesIn(at(900, 300), map)).toEqual([0, 1]);
    expect(copiesIn(at(-100, 300), map)).toEqual([-1, 0]);
  });

  it('follows the view wherever it is, and covers a window wider than the world', () => {
    expect(copiesIn(at(2100, 200), map)).toEqual([2]);
    expect(copiesIn(at(-1900, 200), map)).toEqual([-2]);
    expect(copiesIn(at(-300, 1900), map)).toEqual([-1, 0, 1]);
  });
});

describe('clampCamera', () => {
  it('repairs a camera that is too close, too far, or off the map', () => {
    const fixed = clampCamera({ cx: -50, cy: 9999, k: 99 }, map, phone);
    expect(fixed.k).toBe(maxZoomFor(map, phone));
    expect(clampCamera({ cx: 0, cy: 0, k: 0.01 }, map, phone).k).toBe(1);
    const view = viewOf(fixed, map, phone);
    expect(view.y + view.h).toBeLessThanOrEqual(520 + 1e-9);
  });

  it('brings the centre back into one copy of the world, either way round (#114)', () => {
    expect(clampCamera({ cx: 1030, cy: 260, k: 2 }, map, phone).cx).toBeCloseTo(30);
    expect(clampCamera({ cx: -50, cy: 260, k: 2 }, map, phone).cx).toBeCloseTo(950);
    expect(clampCamera({ cx: 7 * 1000 + 250, cy: 260, k: 2 }, map, phone).cx).toBeCloseTo(250);
    expect(clampCamera({ cx: 500, cy: 260, k: 2 }, map, phone).cx).toBe(500);
  });
});
