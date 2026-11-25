"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

// "Our work" on a business's public page: a grid that opens each photo full size, with its
// caption. Keyboard: arrows to move, Escape to close; focus returns to the photo opened.
export default function PublicGallery({ photos, businessName }) {
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const opener = useRef(null);
  const closeBtn = useRef(null);
  const shown = showAll ? photos : photos.slice(0, 12);

  const close = useCallback(() => {
    setOpen(null);
    requestAnimationFrame(() => opener.current?.focus());
  }, []);
  const move = useCallback((step) => setOpen((i) => (i === null ? null : (i + step + photos.length) % photos.length)), [photos.length]);

  useEffect(() => {
    if (open === null) return undefined;
    closeBtn.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") move(1);
      if (e.key === "ArrowLeft") move(-1);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [open, close, move]);

  const current = open === null ? null : photos[open];
  return (
    <>
      <ul className="pub-gallery">
        {shown.map((ph, i) => (
          <li key={ph.id} className={i === 0 && photos.length >= 5 ? "wide" : undefined}>
            <button type="button" onClick={(e) => { opener.current = e.currentTarget; setOpen(i); }} aria-label={`Open photo ${i + 1} of ${photos.length}${ph.caption ? `: ${ph.caption}` : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ph.url} alt={ph.caption || `Work by ${businessName}`} loading={i < 4 ? "eager" : "lazy"} />
              {ph.caption && <span className="pub-gallery-cap">{ph.caption}</span>}
            </button>
          </li>
        ))}
      </ul>
      {photos.length > shown.length && (
        <button type="button" className="btn btn-light btn-sm" style={{ alignSelf: "center", marginTop: 14 }} onClick={() => setShowAll(true)}>Show all {photos.length} photos</button>
      )}
      {current && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Photo ${open + 1} of ${photos.length}`} onClick={(e) => e.target === e.currentTarget && close()}>
          <button ref={closeBtn} type="button" className="lightbox-btn lightbox-close" onClick={close} aria-label="Close"><Icon name="x" size={22} /></button>
          {photos.length > 1 && <button type="button" className="lightbox-btn lightbox-prev" onClick={() => move(-1)} aria-label="Previous photo"><Icon name="back" size={22} /></button>}
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.url} alt={current.caption || `Work by ${businessName}`} />
            <figcaption><span>{current.caption || businessName}</span><span className="lightbox-count">{open + 1} / {photos.length}</span></figcaption>
          </figure>
          {photos.length > 1 && <button type="button" className="lightbox-btn lightbox-next" onClick={() => move(1)} aria-label="Next photo"><Icon name="arrow" size={22} /></button>}
        </div>
      )}
    </>
  );
}
