/**
 * The world map for map mode (#52): its data shape, and the arithmetic for
 * panning and zooming it. Pure, so the fiddly parts are testable without a
 * browser; `components/WorldMap.tsx` is the part that touches the DOM.
 */

export interface MapCountry {
  /** ISO 3166-1 alpha-2, lowercase: what a tap is sent as. */
  iso: string;
  name: string;
  /** SVG path, already projected into the map's `width` x `height`. */
  d: string;
  /** Where to put the marker for a country too small to tap. */
  cx: number;
  cy: number;
  /** Small enough that it needs a marker, because its shape is a speck or nothing. */
  tiny: boolean;
}

export interface WorldMapData {
  width: number;
  height: number;
  /** Land that is on the map but is not one of the countries: drawn, never the answer. */
  otherLand: string;
  countries: MapCountry[];
}

/** The part of the map on screen, in the map's own units (an SVG `viewBox`). */
export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How far in the map goes: at 14x, a speck like Monaco is a few hundred pixels wide. */
export const MAX_ZOOM = 14;

export function fullView(data: Pick<WorldMapData, 'width' | 'height'>): View {
  return { x: 0, y: 0, w: data.width, h: data.height };
}

/** 1 for the whole world, up to MAX_ZOOM. */
export function zoomLevel(view: View, data: Pick<WorldMapData, 'width'>): number {
  return data.width / view.w;
}

/** Keeps a view on the map: never outside it, never wider than it. */
export function clampView(view: View, data: Pick<WorldMapData, 'width' | 'height'>): View {
  const w = Math.min(data.width, Math.max(data.width / MAX_ZOOM, view.w));
  const h = (w * data.height) / data.width;
  return {
    w,
    h,
    x: Math.min(data.width - w, Math.max(0, view.x)),
    y: Math.min(data.height - h, Math.max(0, view.y)),
  };
}

/**
 * Zooms by `factor` (above 1 in, below 1 out) about a point in map units, which
 * stays where it is on screen: pinching on Iceland leaves Iceland under the
 * fingers rather than sliding away.
 */
export function zoomAt(
  view: View,
  factor: number,
  point: { x: number; y: number },
  data: Pick<WorldMapData, 'width' | 'height'>,
): View {
  const next = clampView({ ...view, w: view.w / factor }, data);
  const ratio = next.w / view.w;
  return clampView(
    {
      ...next,
      x: point.x - (point.x - view.x) * ratio,
      y: point.y - (point.y - view.y) * ratio,
    },
    data,
  );
}

/** Moves the view by a distance in map units. */
export function panBy(
  view: View,
  dx: number,
  dy: number,
  data: Pick<WorldMapData, 'width' | 'height'>,
): View {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy }, data);
}

export const viewBoxOf = (view: View): string => `${view.x} ${view.y} ${view.w} ${view.h}`;
