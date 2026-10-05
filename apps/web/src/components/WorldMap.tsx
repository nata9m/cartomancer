'use client';

import { useEffect, useRef, useState } from 'react';
import { IconMinus, IconPlus, IconWorld } from './icons';
import {
  initialCamera,
  MAX_ZOOM,
  panBy,
  scaleOf,
  viewBoxOf,
  viewOf,
  worldCamera,
  zoomAt,
  type Box,
  type Camera,
  type View,
  type WorldMapData,
} from '@/lib/world-map';

/** How far a finger or cursor may move and still count as a tap rather than a drag. */
const TAP_SLOP_PX = 6;
const ZOOM_STEP = 1.6;
/** On-screen size of a tiny country's tap target and of the dot drawn in it, in pixels. */
const DOT_HIT_PX = 14;
const DOT_MARK_PX = 3.5;

export interface MapReveal {
  correctIso: string;
  /** What was tapped, if anything; null when the player gave up. */
  chosenIso: string | null;
}

/** Screen coordinates to map units, for a view on an element. */
function toMapPoint(
  svg: Element,
  view: View,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  return {
    x: view.x + ((clientX - rect.left) / rect.width) * view.w,
    y: view.y + ((clientY - rect.top) / rect.height) * view.h,
  };
}

/**
 * The map a map-mode question is answered on (#52): countries as SVG paths, tap
 * one to select it, drag to pan, pinch / wheel / the buttons to zoom.
 *
 * The geometry is a ~250 kB module, so it is imported here, when a map question
 * first needs it, rather than shipped with every screen. Until it arrives the
 * frame is reserved at its final size, so nothing jumps.
 *
 * Countries too small to hit (37 of them) also get a dot, with a hit area sized
 * for a fingertip at the current zoom: Monaco is a fraction of a pixel at world
 * scale, and the answer to "find Monaco" cannot be "zoom until it exists".
 *
 * Pointers, not touches: one code path for mouse, finger and pen. A drag past a
 * few pixels is a pan, and the click that follows it is swallowed so that
 * panning across a country does not select it. Pointer capture is taken only once
 * a drag has begun, because capturing at pointerdown retargets the click away
 * from the country that was tapped.
 *
 * Not keyboard-operable, and not meant to be: a list of 195 countries to choose
 * from would answer the question it is asked. Screen-reader and keyboard players
 * have the other quiz modes.
 */
export function WorldMap({
  selectedIso,
  onSelect,
  reveal,
  disabled,
  resetKey,
}: {
  selectedIso: string | null;
  onSelect: (iso: string) => void;
  reveal: MapReveal | null;
  disabled: boolean;
  /** Changes with the question: the map goes back to its opening view. */
  resetKey: number;
}) {
  const [data, setData] = useState<WorldMapData | null>(null);
  const [failed, setFailed] = useState(false);
  const [camera, setCamera] = useState<Camera | null>(null);
  /** The frame's size in pixels: what the screen leaves the map (#91). */
  const [box, setBox] = useState<Box | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragged = useRef(false);
  const pinchDistance = useRef<number | null>(null);
  const dragStart = useRef(new Map<number, { x: number; y: number }>());
  // The handlers below run outside React's render and must see the camera and the
  // frame as they are now, not as they were when they were attached.
  const latest = useRef<{ camera: Camera; box: Box } | null>(null);
  useEffect(() => {
    latest.current = camera && box ? { camera, box } : null;
  }, [camera, box]);

  useEffect(() => {
    let cancelled = false;
    import('@/lib/world-map-data')
      .then((module) => {
        if (!cancelled) setData(module.WORLD_MAP);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The map fills the frame the layout gives it, which changes with the window and
  // with rotating a phone. The camera is independent of the frame's shape, so a
  // new size just means a new view of the same place: nothing is reset, and the
  // selection (held by the question, not by the map) is untouched.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = (width: number, height: number): void => {
      setBox((previous) =>
        previous && previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };
    const rect = frame.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) measure(rect.width, rect.height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        measure(entry.contentRect.width, entry.contentRect.height);
      }
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // Opening view, once there is both a map and a frame to fit it to; and again for
  // each new question, so where the last answer was is no hint at where this one
  // is. Adjusted during render, as React documents for state derived from props.
  const [resetFor, setResetFor] = useState(resetKey);
  if (data && box && (camera === null || resetFor !== resetKey)) {
    setResetFor(resetKey);
    setCamera(initialCamera(data, box));
  }

  // The map is drawn once it has its data, its frame and a camera.
  const ready = data !== null && box !== null && camera !== null;

  // React attaches wheel listeners as passive, which cannot stop the page
  // scrolling under the map; this one has to be able to.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !data) return;
    const element: SVGSVGElement = svg;
    function onWheel(event: WheelEvent): void {
      event.preventDefault();
      const now = latest.current;
      if (!now || !data) return;
      const focus = toMapPoint(
        element,
        viewOf(now.camera, data, now.box),
        event.clientX,
        event.clientY,
      );
      const factor = event.deltaY < 0 ? 1.25 : 1 / 1.25;
      setCamera(zoomAt(now.camera, factor, focus, data, now.box));
    }
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [data, ready]);

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>): void {
    const here = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, here);
    dragStart.current.set(event.pointerId, here);
    if (pointers.current.size === 1) {
      dragged.current = false;
    }
    pinchDistance.current = null;
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>): void {
    const previous = pointers.current.get(event.pointerId);
    const now = latest.current;
    if (!previous || !now || !data) return;
    const here = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, here);
    const view = viewOf(now.camera, data, now.box);

    if (pointers.current.size >= 2) {
      // Two fingers: zoom by how their distance changed, about their midpoint.
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance.current !== null && distance > 0) {
        const focus = toMapPoint(event.currentTarget, view, (a.x + b.x) / 2, (a.y + b.y) / 2);
        setCamera(zoomAt(now.camera, distance / pinchDistance.current, focus, data, now.box));
      }
      pinchDistance.current = distance;
      dragged.current = true;
      return;
    }

    if (!dragged.current) {
      // Compare with where the press began, not the last move: a slow drag is
      // many small ones.
      const start = dragStart.current.get(event.pointerId) ?? previous;
      if (Math.hypot(here.x - start.x, here.y - start.y) < TAP_SLOP_PX) return;
      dragged.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const scale = scaleOf(now.camera, data, now.box);
    setCamera(
      panBy(
        now.camera,
        -(here.x - previous.x) / scale,
        -(here.y - previous.y) / scale,
        data,
        now.box,
      ),
    );
  }

  function onPointerEnd(event: React.PointerEvent<SVGSVGElement>): void {
    pointers.current.delete(event.pointerId);
    dragStart.current.delete(event.pointerId);
    pinchDistance.current = null;
    // The click that ends a drag arrives right after this; once it has, a tap is
    // a tap again.
    if (pointers.current.size === 0) {
      setTimeout(() => {
        dragged.current = false;
      }, 0);
    }
  }

  function select(iso: string): void {
    // The click that ends a drag lands on whatever is under the finger.
    if (disabled || dragged.current) return;
    onSelect(iso);
  }

  function zoomBy(factor: number): void {
    const now = latest.current;
    if (!now || !data) return;
    const view = viewOf(now.camera, data, now.box);
    setCamera(
      zoomAt(now.camera, factor, { x: view.x + view.w / 2, y: view.y + view.h / 2 }, data, now.box),
    );
  }

  const zoom = ready ? camera.k : 1;
  const view = ready ? viewOf(camera, data, box) : null;
  const scale = ready ? scaleOf(camera, data, box) : 1;
  const stateOf = (iso: string): string => {
    if (reveal) {
      if (iso === reveal.correctIso) return ' map-country--correct';
      if (iso === reveal.chosenIso) return ' map-country--wrong';
      return '';
    }
    return iso === selectedIso ? ' map-country--selected' : '';
  };

  return (
    <div className="world-map" ref={frameRef}>
      {failed ? (
        <p className="world-map__message" role="alert">
          The map could not be loaded. Check your connection and try again.
        </p>
      ) : !ready || !view ? (
        <p className="world-map__message" aria-busy="true">
          <IconWorld size={28} stroke={1.4} aria-hidden="true" />
        </p>
      ) : (
        <>
          <svg
            ref={svgRef}
            className={`world-map__svg${disabled ? ' world-map__svg--locked' : ''}`}
            viewBox={viewBoxOf(view)}
            role="group"
            aria-label="World map. Tap a country to select it; drag to move and pinch to zoom."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            <path className="map-land" d={data.otherLand} />
            {data.countries.map((country) => (
              <path
                key={country.iso}
                data-iso={country.iso}
                className={`map-country${stateOf(country.iso)}`}
                d={country.d}
                onClick={() => select(country.iso)}
              />
            ))}
            {data.countries
              .filter((country) => country.tiny)
              .map((country) => (
                <g
                  key={country.iso}
                  data-iso-dot={country.iso}
                  className={`map-dot${stateOf(country.iso)}`}
                  onClick={() => select(country.iso)}
                >
                  {/* Sized in screen pixels, not map units, so they feel the same on
                      a phone and a desktop and at every zoom: a visible dot a few
                      pixels across inside a target about a fingertip wide. */}
                  <circle
                    className="map-dot__hit"
                    cx={country.cx}
                    cy={country.cy}
                    r={DOT_HIT_PX / scale}
                  />
                  <circle
                    className="map-dot__mark"
                    cx={country.cx}
                    cy={country.cy}
                    r={DOT_MARK_PX / scale}
                  />
                </g>
              ))}
          </svg>
          <div className="map-controls">
            <button
              type="button"
              className="map-control"
              aria-label="Zoom in"
              disabled={zoom >= MAX_ZOOM - 0.01}
              onClick={() => zoomBy(ZOOM_STEP)}
            >
              <IconPlus size={16} stroke={2} />
            </button>
            <button
              type="button"
              className="map-control"
              aria-label="Zoom out"
              disabled={zoom <= 1.01}
              onClick={() => zoomBy(1 / ZOOM_STEP)}
            >
              <IconMinus size={16} stroke={2} />
            </button>
            <button
              type="button"
              className="map-control"
              aria-label="Show the whole world"
              disabled={zoom <= 1.01}
              onClick={() => setCamera(worldCamera(data))}
            >
              <IconWorld size={16} stroke={1.8} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
