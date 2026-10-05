import { COUNTRIES } from '@cartomancer/shared';
import { describe, expect, it } from 'vitest';
import { WORLD_MAP } from './world-map-data';
import { clampView, fullView, MAX_ZOOM, panBy, viewBoxOf, zoomAt, zoomLevel } from './world-map';

const data = { width: 1000, height: 520 };

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

describe('fullView', () => {
  it('is the whole map at zoom 1', () => {
    const view = fullView(data);
    expect(view).toEqual({ x: 0, y: 0, w: 1000, h: 520 });
    expect(zoomLevel(view, data)).toBe(1);
    expect(viewBoxOf(view)).toBe('0 0 1000 520');
  });
});

describe('zoomAt', () => {
  it('keeps the point under the cursor where it was', () => {
    const start = fullView(data);
    const point = { x: 600, y: 200 };
    const zoomed = zoomAt(start, 2, point, data);
    expect(zoomed.w).toBe(500);
    // The point sits at the same fraction of the view before and after.
    expect((point.x - zoomed.x) / zoomed.w).toBeCloseTo((point.x - start.x) / start.w);
    expect((point.y - zoomed.y) / zoomed.h).toBeCloseTo((point.y - start.y) / start.h);
  });

  it('keeps the aspect ratio', () => {
    const zoomed = zoomAt(fullView(data), 3, { x: 100, y: 100 }, data);
    expect(zoomed.w / zoomed.h).toBeCloseTo(1000 / 520);
  });

  it('cannot zoom out past the whole world', () => {
    expect(zoomAt(fullView(data), 0.1, { x: 500, y: 260 }, data)).toEqual(fullView(data));
  });

  it('cannot zoom in past the maximum', () => {
    let view = fullView(data);
    for (let step = 0; step < 40; step += 1) {
      view = zoomAt(view, 2, { x: 500, y: 260 }, data);
    }
    expect(zoomLevel(view, data)).toBeCloseTo(MAX_ZOOM);
  });

  it('stays on the map when zooming at a corner', () => {
    const view = zoomAt(fullView(data), 4, { x: 1000, y: 520 }, data);
    expect(view.x + view.w).toBeLessThanOrEqual(1000 + 1e-9);
    expect(view.y + view.h).toBeLessThanOrEqual(520 + 1e-9);
    expect(view.x).toBeGreaterThanOrEqual(0);
  });
});

describe('panBy', () => {
  const zoomed = { x: 400, y: 200, w: 250, h: 130 };

  it('moves the view', () => {
    expect(panBy(zoomed, 30, -20, data)).toEqual({ ...zoomed, x: 430, y: 180 });
  });

  it('stops at every edge', () => {
    expect(panBy(zoomed, -5000, -5000, data)).toMatchObject({ x: 0, y: 0 });
    const far = panBy(zoomed, 5000, 5000, data);
    expect(far.x + far.w).toBe(1000);
    expect(far.y + far.h).toBeCloseTo(520);
  });

  it('cannot pan the whole world', () => {
    expect(panBy(fullView(data), 100, 100, data)).toEqual(fullView(data));
  });
});

describe('clampView', () => {
  it('repairs a view that is too wide or off the map', () => {
    expect(clampView({ x: -50, y: -50, w: 5000, h: 10 }, data)).toEqual(fullView(data));
  });
});
