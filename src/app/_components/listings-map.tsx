"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type MapListing = {
  id: string;
  title: string;
  price_cents: number;
  primary_image_id: string | null;
};

export type MapPostcodeBucket = {
  postcode: string;
  place_name: string | null;
  latitude: number;
  longitude: number;
  listings: MapListing[];
};

/**
 * Cluster-by-postcode map for the /listings page. Each postcode
 * becomes a single circle marker at its centroid, sized + labelled
 * by the number of listings inside it. Clicking opens a Leaflet
 * popup with the listings (title + thumbnail + price + link).
 *
 * Privacy: markers sit at the postcode centroid, not the seller's
 * actual address — same privacy model as the location_postal field.
 *
 * Leaflet is imperative (not React-y) so the map lives inside a
 * useEffect and re-creates when the bucket list changes. The
 * stylesheet has to be imported here (client) since Leaflet's CSS
 * is required for tile sizing + marker positions.
 */
export function ListingsMap({
  buckets,
  offMapCount,
}: {
  buckets: MapPostcodeBucket[];
  /** Count of listings that didn't match any postcode in our
   *  centroid table — surfaced as a footer chip so admins know to
   *  expand the postcodes seed. */
  offMapCount: number;
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

      // Pick the initial centre: average of the rendered points, or
      // fall back to a roughly-central AU location when there's
      // nothing to show.
      let centre: [number, number] = [-25.27, 133.77];
      let zoom = 4;
      if (buckets.length > 0) {
        const sumLat = buckets.reduce((s, b) => s + b.latitude, 0);
        const sumLng = buckets.reduce((s, b) => s + b.longitude, 0);
        centre = [sumLat / buckets.length, sumLng / buckets.length];
        zoom = buckets.length === 1 ? 11 : 6;
      }

      map = L.map(container, {
        center: centre,
        zoom,
        scrollWheelZoom: true,
      });

      // Free CartoDB Positron tiles — clean light styling, no API key.
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        },
      ).addTo(map);

      const bounds = L.latLngBounds([]);
      for (const b of buckets) {
        const count = b.listings.length;
        const size = Math.min(50, 22 + Math.floor(Math.sqrt(count) * 8));
        const icon = L.divIcon({
          className: "frockd-cluster-marker",
          html: `<div style="
            width:${size}px;
            height:${size}px;
            border-radius:50%;
            background:rgba(28,24,22,0.92);
            color:#fff;
            display:flex;
            align-items:center;
            justify-content:center;
            font-family:'Courier New',monospace;
            font-weight:700;
            font-size:${count >= 100 ? 11 : 13}px;
            letter-spacing:0.05em;
            border:3px solid #ffffff;
            box-shadow:0 2px 8px rgba(0,0,0,0.25);
          ">${count >= 100 ? "99+" : count}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
        const marker = L.marker([b.latitude, b.longitude], { icon });
        marker.bindPopup(buildPopupHtml(b), {
          maxWidth: 280,
          className: "frockd-listings-popup",
        });
        marker.addTo(map);
        bounds.extend([b.latitude, b.longitude]);
      }

      if (buckets.length > 1) {
        map.fitBounds(bounds.pad(0.2), { maxZoom: 11 });
      }
    })();

    return () => {
      cancelled = true;
      if (map) {
        map.remove();
        map = null;
      }
    };
  }, [buckets]);

  return (
    <div>
      <div
        ref={ref}
        style={{
          width: "100%",
          height: "calc(100vh - 320px)",
          minHeight: 480,
          borderRadius: 14,
          border: "1px solid var(--hairline)",
          overflow: "hidden",
        }}
      />
      {offMapCount > 0 && (
        <p
          style={{
            marginTop: "var(--s-3)",
            fontSize: 12,
            color: "var(--ink-4)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {offMapCount} listing{offMapCount === 1 ? "" : "s"} not shown
          (postcode not in our centroid table yet)
        </p>
      )}
    </div>
  );
}

function buildPopupHtml(b: MapPostcodeBucket): string {
  const header = b.place_name
    ? `${escapeHtml(b.place_name)} · ${escapeHtml(b.postcode)}`
    : `Postcode ${escapeHtml(b.postcode)}`;
  const count = b.listings.length;
  const list = b.listings
    .slice(0, 6)
    .map((l) => {
      const price = priceFormat(l.price_cents);
      const img = l.primary_image_id
        ? `<img src="/api/listings/${l.id}/images/${l.primary_image_id}?w=200" alt="" style="width:48px;aspect-ratio:3/4;object-fit:cover;border-radius:4px;flex:0 0 auto;background:#f4f1ea;" />`
        : `<div style="width:48px;aspect-ratio:3/4;border-radius:4px;background:#f4f1ea;flex:0 0 auto;"></div>`;
      return `
        <a href="/listings/${l.id}" style="
          display:flex;
          gap:8px;
          align-items:center;
          padding:6px 4px;
          text-decoration:none;
          color:#1c1816;
          border-bottom:1px solid #e9e5df;
        ">
          ${img}
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:13px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(l.title || "Untitled")}</div>
            <div style="font-size:12px;color:#7a7470;margin-top:2px;">${price}</div>
          </div>
        </a>`;
    })
    .join("");
  const more =
    count > 6
      ? `<div style="padding:6px 4px 0;font-size:12px;color:#7a7470;">+ ${count - 6} more</div>`
      : "";
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="
        font-family:'Courier New',monospace;
        font-size:11px;
        letter-spacing:0.12em;
        text-transform:uppercase;
        color:#7a7470;
        margin-bottom:6px;
      ">${count} listing${count === 1 ? "" : "s"} · ${header}</div>
      <div>${list}</div>
      ${more}
    </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function priceFormat(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
