'use client';

import { useEffect, useRef, useState } from 'react';
import { IconMinus, IconPlus, IconWorld } from './icons';
import {
  clampView,
  fullView,
  MAX_ZOOM,
  panBy,
  viewBoxOf,
  zoomAt,
  zoomLevel,
  type View,
  type WorldMapData,
} from '@/lib/world-map';

/** How far a finger or cursor may move and still count as a tap rather than a drag. */
const TAP_SLOP_PX = 6;
const ZOOM_STEP = 1.6;

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
  /** Changes with the question: the map goes back to the whole world. */
  resetKey: number;
}) {
  const [data, setData] = useState<WorldMapData | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragged = useRef(false);
  const pinchDistance = useRef<number | null>(null);
  const dragStart = useRef(new Map<number, { x: number; y: number }>());
  // The handlers below run outside React's render and must see the view as it is
  // now, not as it was when they were attached.
  const viewRef = useRef<View | null>(null);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    let cancelled = false;
    import('@/lib/world-map-data')
      .then((module) => {
        if (cancelled) return;
        setData(module.WORLD_MAP);
        setView(fullView(module.WORLD_MAP));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [resetFor, setResetFor] = useState(resetKey);
  if (resetFor !== resetKey) {
    // A new question starts from the whole world, so where the last answer was
    // is not a hint at where this one is. Adjusted during render, as React
    // documents for state derived from a prop.
    setResetFor(resetKey);
    if (data) setView(fullView(data));
  }

  // React attaches wheel listeners as passive, which cannot stop the page
  // scrolling under the map; this one has to be able to.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !data) return;
    const element: SVGSVGElement = svg;
    function onWheel(event: WheelEvent): void {
      event.preventDefault();
      const current = viewRef.current;
      if (!current || !data) return;
      const focus = toMapPoint(element, current, event.clientX, event.clientY);
      const factor = event.deltaY < 0 ? 1.25 : 1 / 1.25;
      setView(zoomAt(current, factor, focus, data));
    }
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [data]);

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
    const current = viewRef.current;
    if (!previous || !current || !data) return;
    const here = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, here);

    if (pointers.current.size >= 2) {
      // Two fingers: zoom by how their distance changed, about their midpoint.
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance.current !== null && distance > 0) {
        const focus = toMapPoint(event.currentTarget, current, (a.x + b.x) / 2, (a.y + b.y) / 2);
        setView(zoomAt(current, distance / pinchDistance.current, focus, data));
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
    const rect = event.currentTarget.getBoundingClientRect();
    setView(
      panBy(
        current,
        (-(here.x - previous.x) / rect.width) * current.w,
        (-(here.y - previous.y) / rect.height) * current.h,
        data,
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
    const current = viewRef.current;
    if (!current || !data) return;
    setView(
      zoomAt(current, factor, { x: current.x + current.w / 2, y: current.y + current.h / 2 }, data),
    );
  }

  if (failed) {
    return (
      <div className="world-map world-map--empty" role="alert">
        The map could not be loaded. Check your connection and try again.
      </div>
    );
  }
  if (!data || !view) {
    return (
      <div className="world-map world-map--empty" aria-busy="true">
        <IconWorld size={28} stroke={1.4} aria-hidden="true" />
      </div>
    );
  }

  const zoom = zoomLevel(view, data);
  const stateOf = (iso: string): string => {
    if (reveal) {
      if (iso === reveal.correctIso) return ' map-country--correct';
      if (iso === reveal.chosenIso) return ' map-country--wrong';
      return '';
    }
    return iso === selectedIso ? ' map-country--selected' : '';
  };

  return (
    <div className="world-map">
      <svg
        ref={svgRef}
        className={`world-map__svg${disabled ? ' world-map__svg--locked' : ''}`}
        viewBox={viewBoxOf(clampView(view, data))}
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
              {/* The visible dot is small; the circle around it is the target. */}
              <circle className="map-dot__hit" cx={country.cx} cy={country.cy} r={30 / zoom} />
              <circle className="map-dot__mark" cx={country.cx} cy={country.cy} r={6 / zoom} />
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
          onClick={() => setView(fullView(data))}
        >
          <IconWorld size={16} stroke={1.8} />
        </button>
      </div>
    </div>
  );
}
