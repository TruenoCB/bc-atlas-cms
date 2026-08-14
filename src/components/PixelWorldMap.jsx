import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoCentroid, geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import { MapPin } from "@phosphor-icons/react";

const worldCountries = feature(world, world.objects.countries);
const regionalCountries = {
  ...worldCountries,
  features: worldCountries.features.filter((country) => {
    if (country.id === "010") return false;
    const [longitude, latitude] = geoCentroid(country);
    return longitude >= 45 && longitude <= 180 && latitude >= -58;
  }),
};
const globalCountries = {
  ...worldCountries,
  features: worldCountries.features.filter((country) => country.id !== "010"),
};

function getFootprint(article) {
  const tag = article.tags?.find((item) => item.slug === "footprint");
  if (!tag) return null;
  const latitude = Number(tag.properties?.latitude);
  const longitude = Number(tag.properties?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    locationName: tag.properties?.location_name ?? article.title,
  };
}

export function PixelWorldMap({
  footprints,
  onSelect,
  selectedId,
  expanded = false,
  ambient = false,
  clickable = Boolean(onSelect),
  showLabels = true,
  animateFormation = true,
  className = "",
}) {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  const formationStartRef = useRef(0);
  const pointsRef = useRef([]);
  const markersRef = useRef([]);
  const pointerRef = useRef({ x: -1000, y: -1000, nx: 0, ny: 0, active: false });
  const reducedMotionRef = useRef(false);
  const [hovered, setHovered] = useState(null);
  const [markerButtons, setMarkerButtons] = useState([]);

  const mapped = useMemo(
    () => footprints.map((article) => ({ article, geo: getFootprint(article) })).filter((item) => item.geo),
    [footprints],
  );

  const rebuild = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));

    const projection = expanded
      ? geoNaturalEarth1().fitExtent([[56, 54], [rect.width - 56, rect.height - 46]], globalCountries)
      : geoNaturalEarth1()
        .center([112, 4])
        .scale(Math.min(rect.height * 0.325, rect.width * 0.37))
        .translate([rect.width * 0.35, rect.height * 0.605]);
    const focusPoint = expanded ? null : projection([139.6503, 35.6762]);
    const horizontalScale = expanded ? 1 : 1.15;
    const verticalScale = expanded ? 1 : 1.48;
    const transformPoint = ([x, y]) => expanded ? [x, y] : [
      focusPoint[0] + (x - focusPoint[0]) * horizontalScale,
      focusPoint[1] + (y - focusPoint[1]) * verticalScale,
    ];
    const mask = document.createElement("canvas");
    mask.width = Math.max(1, Math.ceil(rect.width));
    mask.height = Math.max(1, Math.ceil(rect.height));
    const maskContext = mask.getContext("2d", { willReadFrequently: true });
    maskContext.fillStyle = "#fff";
    maskContext.save();
    if (!expanded) {
      maskContext.translate(focusPoint[0], focusPoint[1]);
      maskContext.scale(horizontalScale, verticalScale);
      maskContext.translate(-focusPoint[0], -focusPoint[1]);
    }
    maskContext.beginPath();
    geoPath(projection, maskContext)(expanded ? globalCountries : regionalCountries);
    maskContext.fill();
    maskContext.restore();
    const maskPixels = maskContext.getImageData(0, 0, mask.width, mask.height).data;
    const step = ambient
      ? (rect.width < 900 ? 7 : 6)
      : expanded
        ? (rect.width < 900 ? 6 : 5)
        : (rect.width < 680 ? 6 : 5);
    const points = [];
    for (let y = expanded ? 26 : 34; y < rect.height - 42; y += step) {
      for (let x = expanded ? 26 : 82; x < rect.width - 26; x += step) {
        const pixelIndex = (Math.floor(y) * mask.width + Math.floor(x)) * 4 + 3;
        if (maskPixels[pixelIndex] > 0) {
          const phase = ((x * 13 + y * 7) % 97) / 97;
          const depth = 0.58 + (((x * 17 + y * 11) % 41) / 41) * 0.72;
          points.push({
            x,
            y,
            phase,
            depth,
            scatterX: Math.cos(phase * Math.PI * 6) * (26 + depth * 28),
            scatterY: Math.sin(phase * Math.PI * 4) * (18 + depth * 24),
            accent: ((x * 19 + y * 23) % 113) > 108,
          });
        }
      }
    }
    pointsRef.current = points;
    formationStartRef.current = performance.now();
    const markers = mapped.map((item) => {
      const point = projection([item.geo.longitude, item.geo.latitude]);
      const transformed = point ? transformPoint(point) : null;
      return transformed ? { ...item, x: transformed[0], y: transformed[1] } : null;
    }).filter(Boolean);
    markersRef.current = markers;
    setMarkerButtons(markers);
  }, [expanded, mapped]);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observer = new ResizeObserver(rebuild);
    if (canvasRef.current) observer.observe(canvasRef.current);
    rebuild();
    return () => observer.disconnect();
  }, [rebuild]);

  useEffect(() => {
    if (!ambient) return undefined;
    const trackPointer = (event) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const active = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
      pointerRef.current = active
        ? { x, y, nx: x / rect.width - 0.5, ny: y / rect.height - 0.5, active: true }
        : { x: -1000, y: -1000, nx: 0, ny: 0, active: false };
    };
    const clearPointer = () => {
      pointerRef.current = { x: -1000, y: -1000, nx: 0, ny: 0, active: false };
    };
    window.addEventListener("pointermove", trackPointer, { passive: true });
    window.addEventListener("blur", clearPointer);
    return () => {
      window.removeEventListener("pointermove", trackPointer);
      window.removeEventListener("blur", clearPointer);
    };
  }, [ambient]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d");

    const draw = (time) => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.width / ratio;
      const height = canvas.height / ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const pointer = pointerRef.current;
      const globalX = pointer.active && !reducedMotionRef.current ? pointer.nx * 5 : 0;
      const globalY = pointer.active && !reducedMotionRef.current ? pointer.ny * 3 : 0;

      const formationAge = time - formationStartRef.current;
      for (const point of pointsRef.current) {
        const dx = point.x - pointer.x;
        const dy = point.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        const influenceRadius = ambient ? 168 : 112;
        const influence = pointer.active && !reducedMotionRef.current ? Math.max(0, 1 - distance / influenceRadius) : 0;
        const wave = Math.sin(time * 0.003 + point.phase * Math.PI * 2);
        const gatherProgress = !animateFormation || reducedMotionRef.current
          ? 1
          : Math.max(0, Math.min(1, (formationAge - point.phase * 360) / 980));
        const gathered = 1 - Math.pow(1 - gatherProgress, 3);
        const push = influence * influence * (ambient ? 18 : 12);
        const side = push * (dx / Math.max(distance, 1));
        const lift = push * (dy / Math.max(distance, 1)) + influence * wave * 2.2;
        const x = point.x + point.scatterX * (1 - gathered) + globalX + side;
        const y = point.y + point.scatterY * (1 - gathered) + globalY + lift;
        const baseAlpha = ambient ? 0.15 : 0.22;
        const alpha = (baseAlpha + point.depth * 0.06 + influence * 0.48) * Math.max(0.15, gathered);
        context.fillStyle = point.accent
          ? `rgba(174, 108, 255, ${Math.min(0.34, alpha * 1.18)})`
          : `rgba(184, 185, 194, ${alpha})`;
        const pointSize = Math.max(2, (ambient ? 2.2 : 2.6) + point.depth * 0.6 + influence * 1.6);
        if (influence > 0.58 || point.accent) {
          context.shadowColor = "rgba(169, 103, 255, .36)";
          context.shadowBlur = influence > 0.58 ? 7 : 3;
        }
        context.fillRect(Math.round(x), Math.round(y), pointSize, pointSize);
        context.shadowBlur = 0;
      }

      markersRef.current.forEach((marker) => {
        const x = marker.x + globalX;
        const y = marker.y + globalY;
        if (x < 12 || x > width - 12 || y < 12 || y > height - 12) return;
        const isActive = marker.article.id === selectedId || marker.article.id === hovered?.article.id;
        context.fillStyle = isActive ? "#c18aff" : "#9c5cff";
        context.shadowColor = "rgba(165, 108, 255, .72)";
        context.shadowBlur = isActive ? 12 : 8;
        if (marker.article.locked) {
          context.strokeStyle = "rgba(193,138,255,.78)";
          context.strokeRect(x - 4, y - 4, isActive ? 9 : 8, isActive ? 9 : 8);
        } else {
          context.fillRect(x - 4, y - 4, isActive ? 9 : 8, isActive ? 9 : 8);
        }
        context.shadowBlur = 0;
        if (!showLabels) return;
        const labelPrefix = marker.article.locked ? "MEMBER NOTE" : "FIELD NOTE";
        const label = `${labelPrefix} / ${marker.geo.locationName.toUpperCase()}`;
        context.font = "500 12px Inter, sans-serif";
        context.letterSpacing = "1.25px";
        const labelWidth = context.measureText(label).width;
        if (width < 520) {
          const labelX = Math.max(12, Math.min(width - labelWidth - 12, x - labelWidth / 2));
          const labelAbove = y > height - 92;
          const labelY = labelAbove ? y - 38 : y + 43;
          context.strokeStyle = "rgba(177, 172, 184, .30)";
          context.beginPath();
          context.moveTo(x, labelAbove ? y - 9 : y + 9);
          context.lineTo(x, labelAbove ? y - 27 : y + 29);
          context.stroke();
          context.fillStyle = "rgba(227,224,233,.72)";
          context.fillText(label, labelX, labelY);
          context.letterSpacing = "0px";
          return;
        }
        const labelOnLeft = x + 76 + labelWidth > width - 18;
        const lineStart = labelOnLeft ? x - 9 : x + 9;
        const lineEnd = labelOnLeft ? x - 64 : x + 64;
        const labelX = labelOnLeft ? x - 76 - labelWidth : x + 76;

        context.strokeStyle = "rgba(177, 172, 184, .30)";
        context.beginPath();
        context.moveTo(lineStart, y);
        context.lineTo(lineEnd, y);
        context.stroke();
        context.fillStyle = "rgba(227,224,233,.72)";
        context.fillText(label, labelX, y + 4);
        context.letterSpacing = "0px";
      });

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [ambient, animateFormation, expanded, hovered, selectedId, showLabels]);

  const locateMarker = (x, y) => {
    const pointer = pointerRef.current;
    const globalX = pointer.active ? pointer.nx * 5 : 0;
    const globalY = pointer.active ? pointer.ny * 3 : 0;
    return markersRef.current.find((marker) => Math.hypot(marker.x + globalX - x, marker.y + globalY - y) < 28);
  };

  const handlePointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointerRef.current = { x, y, nx: x / rect.width - 0.5, ny: y / rect.height - 0.5, active: true };
    const marker = locateMarker(x, y);
    setHovered(showLabels && marker ? marker : null);
    event.currentTarget.style.cursor = clickable && marker ? "pointer" : "default";
  };

  const handlePointerLeave = () => {
    pointerRef.current = { x: -1000, y: -1000, nx: 0, ny: 0, active: false };
    setHovered(null);
  };

  return (
    <div
      className={`map-stage${expanded ? " expanded" : ""}${ambient ? " ambient" : ""}${className ? ` ${className}` : ""}`}
      aria-hidden={ambient ? "true" : undefined}
      aria-label={ambient ? undefined : expanded ? "Interactive global footprint map" : "Interactive Asia-Pacific footprint map"}
      onPointerMove={ambient ? undefined : handlePointerMove}
      onPointerLeave={ambient ? undefined : handlePointerLeave}
    >
      <canvas
        ref={canvasRef}
        className="world-canvas"
      />
      {clickable && onSelect ? markerButtons.map((marker) => (
        <button
          key={marker.article.id}
          className="map-marker-hitarea"
          type="button"
          style={{ left: marker.x, top: marker.y }}
          aria-label={`Open footprint: ${marker.article.title}`}
          onFocus={() => setHovered(marker)}
          onBlur={() => setHovered(null)}
          onClick={() => onSelect(marker.article)}
        />
      )) : null}
      {showLabels && hovered ? (
        <div className="hover-label" aria-hidden="true">
          <MapPin size={13} weight="fill" />
          {hovered.article.title}
        </div>
      ) : null}
    </div>
  );
}
