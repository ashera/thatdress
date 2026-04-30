"use client";

import { useCallback, useEffect, useState } from "react";

export type GalleryImage = {
  id: string;
  src: string;
  isPrimary: boolean;
};

export function ListingGallery({ images }: { images: GalleryImage[] }) {
  const [index, setIndex] = useState(0);
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
    if (count <= 1) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, next, prev]);

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
        <img src={current.src} alt={`Photo ${index + 1} of ${count}`} />
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
              <img src={img.src} alt="" />
              {img.isPrimary && <span className="primary-dot" aria-label="Primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
