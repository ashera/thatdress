"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

/**
 * Single-marker map for spot-checking a postcode centroid. Same
 * tile style as ListingsMap (CartoDB Positron) so the admin
 * postcode-lookup result feels visually consistent with the
 * public listings map. Renders into a fixed-height block; height
 * is configurable for callers that want a thinner inline map.
 */
export function CentroidMap({
  latitude,
  longitude,
  label,
  height = 260,
}: {
  latitude: number;
  longitude: number;
  label?: string | null;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    if (!ref.current) return;
    const container = ref.current;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !container) return;

      map = L.map(container, {
        center: [latitude, longitude],
        zoom: 13,
        scrollWheelZoom: false,
        zoomControl: true,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        },
      ).addTo(map);

      const icon = L.divIcon({
        className: "frockd-centroid-marker",
        html: `<div style="
          width:22px;
          height:22px;
          border-radius:50%;
          background:#1c1816;
          border:3px solid #fff;
          box-shadow:0 2px 8px rgba(0,0,0,0.25);
        "></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker([latitude, longitude], { icon }).addTo(map);
      if (label) {
        marker
          .bindPopup(
            `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#1c1816;font-weight:600;">${escapeHtml(label)}</div>`,
            { maxWidth: 220 },
          )
          .openPopup();
      }
    })();

    return () => {
      cancelled = true;
      if (map) {
        map.remove();
        map = null;
      }
    };
  }, [latitude, longitude, label]);

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        height,
        borderRadius: 10,
        border: "1px solid var(--hairline)",
        overflow: "hidden",
      }}
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
