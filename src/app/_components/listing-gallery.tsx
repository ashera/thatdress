"use client";

import { useCallback, useEffect, useState } from "react";

export type GalleryImage = {
  id: string;
  src: string;
  isPrimary: boolean;
};

export function ListingGallery({
  images,
  title,
}: {
  images: GalleryImage[];
  title?: string;
}) {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const count = images.length;

  const next = useCallback(
    () => setIndex((i) => (i + 1) % count),
    [count],
  );
  const prev = useCallback(
    () => setIndex((i) => (i - 1 + count) % count),
    [count],
  );

  useEffect(() => {
    if (count <= 1 && !zoomed) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && zoomed) {
        setZoomed(false);
        return;
      }
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, next, prev, zoomed]);

  // Lock background scroll while the lightbox is open.
  useEffect(() => {
    if (!zoomed) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [zoomed]);

  if (count === 0) {
    return (
      <div className="detail-photo">
        <span>No photos yet</span>
      </div>
    );
  }

  const current = images[index];

  return (
    <div className="gallery">
      <div className="gallery-stage">
        <button
          type="button"
          className="gallery-zoom-trigger"
          onClick={() => setZoomed(true)}
          aria-label="Open photo full size"
        >
          <img src={current.src} alt={
              title
                ? `${title} — photo ${index + 1} of ${count}`
                : `Photo ${index + 1} of ${count}`
            } />
        </button>
        {count > 1 && (
          <>
            <button
              type="button"
              className="gallery-nav --prev"
              onClick={prev}
              aria-label="Previous photo"
            >
              ‹
            </button>
            <button
              type="button"
              className="gallery-nav --next"
              onClick={next}
              aria-label="Next photo"
            >
              ›
            </button>
            <div className="gallery-counter">
              {index + 1} / {count}
            </div>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="gallery-thumbs" role="tablist">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              className={`gallery-thumb ${i === index ? "is-active" : ""}`}
              onClick={() => setIndex(i)}
              role="tab"
              aria-selected={i === index}
              aria-label={`Show photo ${i + 1}`}
            >
              <img
                src={img.src}
                alt={title ? `${title} thumbnail` : ""}
              />
              {img.isPrimary && (
                <span className="primary-dot" aria-label="Primary" />
              )}
            </button>
          ))}
        </div>
      )}

      {zoomed && (
        <div
          className="lightbox-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Photo lightbox"
          onClick={(e) => {
            // Close when clicking the backdrop, not the image / controls.
            if (e.target === e.currentTarget) setZoomed(false);
          }}
        >
          <button
            type="button"
            className="lightbox-close"
            onClick={() => setZoomed(false)}
            aria-label="Close lightbox"
          >
            ✕
          </button>
          <img
            src={current.src}
            alt={
              title
                ? `${title} — photo ${index + 1} of ${count}`
                : `Photo ${index + 1} of ${count}`
            }
            className="lightbox-img"
          />
          {count > 1 && (
            <>
              <button
                type="button"
                className="lightbox-nav --prev"
                onClick={prev}
                aria-label="Previous photo"
              >
                ‹
              </button>
              <button
                type="button"
                className="lightbox-nav --next"
                onClick={next}
                aria-label="Next photo"
              >
                ›
              </button>
              <div className="lightbox-counter">
                {index + 1} / {count}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
