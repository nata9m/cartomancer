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

/**
 * How far in the map goes (#113), as pixels per map unit: a limit on the screen,
 * not on a multiple of the world, because "the whole world fitting the frame" is
 * a few hundred pixels on a phone and over a thousand on a desktop, and a country
 * is as small to a fingertip at one multiple as the other is large.
 *
 * 18 px per map unit makes the smallest country that has no marker (Fiji, Jamaica,
 * Qatar, a bit over two map units across at its narrowest) about 45px wide, a
 * fingertip, and a mid-sized one such as Albania a few hundred.
 */
export const MAX_SCALE = 18;

/**
 * The least zoom the map always allows, as a multiple of the world fitting the
 * frame (what the limit was before #113): a large screen, where this is already
 * more than `MAX_SCALE` asks for, keeps it.
 */
export const MIN_MAX_ZOOM = 14;

/** The furthest in the map goes in this frame, as a multiple of the world fitting it. */
export function maxZoomFor(map: Pick<WorldMapData, 'width' | 'height'>, box: Box): number {
  return Math.max(MIN_MAX_ZOOM, MAX_SCALE / containScale(map, box));
}

/** Pixels per map unit at which the whole world just fits inside the frame. */
export function containScale(map: Pick<WorldMapData, 'width' | 'height'>, box: Box): number {
  return Math.min(box.width / map.width, box.height / map.height);
}

/** Pixels per map unit at which the map just covers the frame, with no bare sea. */
export function coverScale(map: Pick<WorldMapData, 'width' | 'height'>, box: Box): number {
  return Math.max(box.width / map.width, box.height / map.height);
}

/**
 * Keeps a camera valid: zoom within bounds, the view never past the top or bottom
 * of the map, and the centre brought back into the one copy of the world that
 * the camera is stored in (#114).
 *
 * The map is a 360 degree strip that repeats sideways, so there is no left or
 * right edge to stop at: `cx` is taken modulo the width, which changes nothing
 * the player can see (the copies are identical) and keeps the numbers small
 * however far they have dragged. Vertically the poles are real edges. When the
 * world is shorter than the frame, it is centred in it rather than pinned to the
 * top, so the bare sea is split evenly.
 */
export function clampCamera(
  camera: Camera,
  map: Pick<WorldMapData, 'width' | 'height'>,
  box: Box,
): Camera {
  const k = Math.min(maxZoomFor(map, box), Math.max(1, camera.k));
  const scale = containScale(map, box) * k;
  const h = box.height / scale;
  const centreY = (value: number): number =>
    h >= map.height ? map.height / 2 : Math.min(map.height - h / 2, Math.max(h / 2, value));
  const wrapX = ((camera.cx % map.width) + map.width) % map.width;
  return { k, cx: wrapX, cy: centreY(camera.cy) };
}

/**
 * Which copies of the world a view touches, as offsets in whole widths: 0 is the
 * original, -1 the copy to its left, 1 the one to its right (#114). Usually one or
 * two; a window wider than the world shows more. Only these are worth drawing.
 */
export function copiesIn(view: View, map: Pick<WorldMapData, 'width'>): number[] {
  const first = Math.floor(view.x / map.width);
  const last = Math.max(first, Math.ceil((view.x + view.w) / map.width) - 1);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
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
 * The camera for a frame of a new size that leaves the map exactly where it is on
 * screen (#112): the same pixels per map unit, and the frame's top-left corner
 * still over the same point of the map. A frame that grows or shrinks by a few
 * pixels then shows a little more or less at its far edges, instead of
 * re-fitting, which on a small change reads as the whole map jumping.
 *
 * A rotation or a window resize is a different thing and re-fits (#91); this is
 * for the frame settling while the player is looking at an answer.
 */
export function keepView(
  camera: Camera,
  map: Pick<WorldMapData, 'width' | 'height'>,
  from: Box,
  to: Box,
): Camera {
  const scale = scaleOf(camera, map, from);
  const held = clampCamera(camera, map, from);
  return clampCamera(
    {
      cx: held.cx + (to.width - from.width) / 2 / scale,
      cy: held.cy + (to.height - from.height) / 2 / scale,
      k: scale / containScale(map, to),
    },
    map,
    to,
  );
}

/**
 * How much of the map's height the opening view shows at most. The map runs from
 * 84 degrees north to 58 south so that nothing is cut off when panning, but every
 * country is between about 55 south and 72 north, and fitting all of it in a
 * phone's height would make a country around a fifth smaller than the same
 * screen showed before the map was a Mercator strip (#114).
 */
export const OPENING_HEIGHT_SHARE = 0.78;

/** Where the opening view is centred vertically, as a share of the height (a little north of the equator). */
const OPENING_CENTRE_Y = 0.6;

/**
 * Where a question starts: the map filling the frame, centred on a neutral spot
 * (Europe and Africa, a little east of the middle of the map) so that the opening
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
  const opening = Math.max(box.width / map.width, box.height / (map.height * OPENING_HEIGHT_SHARE));
  const fill = opening / containScale(map, box);
  return clampCamera(
    { cx: map.width * 0.52, cy: map.height * OPENING_CENTRE_Y, k: fill <= 1.15 ? 1 : fill },
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
  const k = Math.min(maxZoomFor(map, box), Math.max(1, clampCamera(camera, map, box).k * factor));
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
