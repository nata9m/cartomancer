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

/** A size in pixels: the frame the map is drawn in. */
export interface Box {
  width: number;
  height: number;
}

/**
 * Where the map is looking (#91): the point at the middle of the frame, and how
 * far in, as a multiple of the zoom at which the whole world just fits.
 *
 * This, and not a view rectangle, is what the component keeps, because the frame
 * is no longer a fixed shape. The map fills whatever the screen leaves it, so a
 * phone held upright, the same phone on its side and a desktop window are three
 * different frames, and a view rectangle belongs to one of them. A camera is
 * the same in all three: resize the frame and the view is recomputed from it,
 * which is how the map re-fits on rotation without losing its place.
 */
export interface Camera {
  cx: number;
  cy: number;
  /** 1 is the whole world visible; larger is closer. */
  k: number;
}

/** How far in the map goes, as a multiple of the whole world fitting the frame. */
export const MAX_ZOOM = 14;

/** Pixels per map unit at which the whole world just fits inside the frame. */
export function containScale(map: Pick<WorldMapData, 'width' | 'height'>, box: Box): number {
  return Math.min(box.width / map.width, box.height / map.height);
}

/** Pixels per map unit at which the map just covers the frame, with no bare sea. */
export function coverScale(map: Pick<WorldMapData, 'width' | 'height'>, box: Box): number {
  return Math.max(box.width / map.width, box.height / map.height);
}

/**
 * Keeps a camera on the map: zoom within bounds, and the view never off the edge.
 * When the world is narrower (or shorter) than the frame, it is centred in it
 * rather than pinned to a side, so the bare sea is split evenly.
 */
export function clampCamera(
  camera: Camera,
  map: Pick<WorldMapData, 'width' | 'height'>,
  box: Box,
): Camera {
  const k = Math.min(MAX_ZOOM, Math.max(1, camera.k));
  const scale = containScale(map, box) * k;
  const w = box.width / scale;
  const h = box.height / scale;
  const centre = (value: number, span: number, limit: number): number =>
    span >= limit ? limit / 2 : Math.min(limit - span / 2, Math.max(span / 2, value));
  return { k, cx: centre(camera.cx, w, map.width), cy: centre(camera.cy, h, map.height) };
}

/** The `viewBox` rectangle a camera looks through, for a frame of this size. */
export function viewOf(
  camera: Camera,
  map: Pick<WorldMapData, 'width' | 'height'>,
  box: Box,
): View {
  const { cx, cy, k } = clampCamera(camera, map, box);
  const scale = containScale(map, box) * k;
  const w = box.width / scale;
  const h = box.height / scale;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Pixels per map unit for a camera: what a fingertip is worth in map units. */
export function scaleOf(camera: Camera, map: Pick<WorldMapData, 'width' | 'height'>, box: Box) {
  return containScale(map, box) * clampCamera(camera, map, box).k;
}

/**
 * Where a question starts: the map filling the frame, centred on a neutral spot
 * (Europe and Africa, the middle of the Natural Earth map) so that the opening
 * view says nothing about where the answer is.
 *
 * Filling the frame, not fitting the world in it, is the point of #91: on a phone
 * held upright that means the height is used and the width is a slice to pan
 * across, which makes a typical country a fingertip-sized target at once. The
 * whole world is one tap away on the reset button.
 */
export function initialCamera(map: Pick<WorldMapData, 'width' | 'height'>, box: Box): Camera {
  // How much closer "fill the frame" is than "fit the world": about 1 for a frame
  // the shape of the map, and far above 1 for a tall one. A frame within 15% of
  // the map's shape shows the whole world rather than shaving its edges off for a
  // sliver of extra size.
  const fill = coverScale(map, box) / containScale(map, box);
  return clampCamera(
    { cx: map.width * 0.52, cy: map.height / 2, k: fill <= 1.15 ? 1 : fill },
    map,
    box,
  );
}

/** The whole world, centred. */
export function worldCamera(map: Pick<WorldMapData, 'width' | 'height'>): Camera {
  return { cx: map.width / 2, cy: map.height / 2, k: 1 };
}

/**
 * Zooms by `factor` (above 1 in, below 1 out) about a point in map units, which
 * stays where it is on screen: pinching on Iceland leaves Iceland under the
 * fingers rather than sliding away.
 */
export function zoomAt(
  camera: Camera,
  factor: number,
  point: { x: number; y: number },
  map: Pick<WorldMapData, 'width' | 'height'>,
  box: Box,
): Camera {
  const before = viewOf(camera, map, box);
  const k = Math.min(MAX_ZOOM, Math.max(1, clampCamera(camera, map, box).k * factor));
  const scale = containScale(map, box) * k;
  const w = box.width / scale;
  const h = box.height / scale;
  // The point sits at the same fraction of the frame before and after.
  const fx = (point.x - before.x) / before.w;
  const fy = (point.y - before.y) / before.h;
  return clampCamera({ k, cx: point.x - fx * w + w / 2, cy: point.y - fy * h + h / 2 }, map, box);
}

/** Moves the camera by a distance in map units. */
export function panBy(
  camera: Camera,
  dx: number,
  dy: number,
  map: Pick<WorldMapData, 'width' | 'height'>,
  box: Box,
): Camera {
  const current = clampCamera(camera, map, box);
  return clampCamera({ ...current, cx: current.cx + dx, cy: current.cy + dy }, map, box);
}

export const viewBoxOf = (view: View): string => `${view.x} ${view.y} ${view.w} ${view.h}`;
