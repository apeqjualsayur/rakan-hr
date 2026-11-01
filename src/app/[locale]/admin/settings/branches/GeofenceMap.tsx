"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";

// ORG-03 map picker: OpenStreetMap tiles via Leaflet (no API key). Click the map or drag
// the pin to move it; the circle shows the geofence radius. Leaflet touches `window`, so
// it is loaded in the browser only.

const KUALA_LUMPUR: [number, number] = [3.139, 101.6869];
// primary / primary-strong from globals.css (Leaflet draws SVG with inline colours).
const PRIMARY = "#1e6b52";
const PRIMARY_STRONG = "#14503d";

export function GeofenceMap({
  lat,
  lng,
  radius,
  onPick,
  readOnly = false,
  label,
}: {
  lat: number | null;
  lng: number | null;
  radius: number;
  onPick: (lat: number, lng: number) => void;
  readOnly?: boolean;
  label: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const leaflet = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const pin = useRef<Leaflet.Marker | null>(null);
  const circle = useRef<Leaflet.Circle | null>(null);
  const onPickRef = useRef(onPick);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onPickRef.current = onPick;
  });

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !container.current) return;
      const start: [number, number] =
        lat !== null && lng !== null ? [lat, lng] : KUALA_LUMPUR;
      const m = L.map(container.current, {
        scrollWheelZoom: false,
        keyboard: true,
      }).setView(start, lat !== null ? 18 : 11);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
      if (!readOnly) {
        m.on("click", (e) => onPickRef.current(e.latlng.lat, e.latlng.lng));
      }
      leaflet.current = L;
      map.current = m;
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      pin.current = null;
      circle.current = null;
    };
    // The map is created once; later changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the pin and circle in step with the form values.
  useEffect(() => {
    const L = leaflet.current;
    const m = map.current;
    if (!ready || !L || !m) return;

    if (lat === null || lng === null) {
      pin.current?.remove();
      circle.current?.remove();
      pin.current = null;
      circle.current = null;
      return;
    }

    const point = L.latLng(lat, lng);
    if (!pin.current) {
      pin.current = L.marker(point, {
        draggable: !readOnly,
        keyboard: false,
        icon: L.divIcon({
          className: "",
          html: `<span style="display:block;width:24px;height:24px;border-radius:999px;background:${PRIMARY_STRONG};border:4px solid #fff;box-shadow:0 2px 6px rgba(30,42,36,.35)"></span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      }).addTo(m);
      pin.current.on("dragend", () => {
        const p = pin.current?.getLatLng();
        if (p) onPickRef.current(p.lat, p.lng);
      });
      circle.current = L.circle(point, {
        radius,
        color: PRIMARY,
        weight: 2,
        fillColor: PRIMARY,
        fillOpacity: 0.15,
        interactive: false,
      }).addTo(m);
    } else {
      pin.current.setLatLng(point);
      circle.current?.setLatLng(point).setRadius(radius);
    }
    if (!m.getBounds().contains(point)) {
      m.setView(point, Math.max(m.getZoom(), 17));
    }
  }, [ready, lat, lng, radius, readOnly]);

  return (
    // `isolate` keeps Leaflet's high z-indexes below the sticky top nav.
    <div
      ref={container}
      role="application"
      aria-label={label}
      className="isolate h-80 w-full overflow-hidden rounded-tile border border-border bg-track md:h-[420px]"
    />
  );
}
