import { useCallback, useEffect, useRef, useState } from "react";

const MIN_LENS = 80;
const MAX_LENS = 500;
const DEFAULT_LENS = 180;
// Scroll sensitivity — applied to the log of the current size,
// so the same scroll delta produces smaller pixel changes at larger sizes
const SCROLL_FACTOR = 0.08;

interface MagnifierImageProps {
  src: string;
  alt: string;
  enabled: boolean;
  zoom?: number;
}

/**
 * Image component with an optional magnifying glass overlay.
 *
 * When `enabled` is true, hovering over the image shows a circular lens
 * that displays a zoomed-in portion of the image at the cursor position.
 *
 * Scroll wheel resizes the lens using logarithmic scaling: the lens grows
 * quickly when small but slows down as it gets bigger, giving fine control
 * at large sizes.
 *
 * Uses a hidden canvas to draw the zoomed region, which works reliably
 * with both regular URLs and large base64 data URIs.
 */
export function MagnifierImage({
  src,
  alt,
  enabled,
  zoom = 3,
}: MagnifierImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);
  const [lensSize, setLensSize] = useState(DEFAULT_LENS);

  // Handle scroll to resize the lens logarithmically.
  // We work in log-space: scrolling adds/subtracts a fixed amount to
  // log(lensSize), then we exponentiate back. This means a scroll tick
  // at 100px adds ~8px, but the same tick at 400px adds ~32px — it
  // feels proportional and natural.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setLensSize((prev) => {
        const logSize = Math.log(prev);
        const delta = e.deltaY > 0 ? -SCROLL_FACTOR : SCROLL_FACTOR;
        const next = Math.exp(logSize + delta);
        return Math.round(Math.min(MAX_LENS, Math.max(MIN_LENS, next)));
      });
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [enabled]);

  const updateLens = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled || !imgRef.current || !canvasRef.current) return;

      const img = imgRef.current;
      const canvas = canvasRef.current;
      const rect = img.getBoundingClientRect();

      // Cursor position relative to the displayed image
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      setLens({ x, y });

      // Map the cursor position from displayed pixels to natural image pixels
      const ratioX = img.naturalWidth / rect.width;
      const ratioY = img.naturalHeight / rect.height;

      // The source region in natural image coordinates, centered on cursor
      const srcX = x * ratioX - (lensSize / zoom / 2) * ratioX;
      const srcY = y * ratioY - (lensSize / zoom / 2) * ratioY;
      const srcW = (lensSize / zoom) * ratioX;
      const srcH = (lensSize / zoom) * ratioY;

      // Draw the zoomed region onto the canvas
      canvas.width = lensSize;
      canvas.height = lensSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, lensSize, lensSize);

      // Clip to a circle
      ctx.beginPath();
      ctx.arc(lensSize / 2, lensSize / 2, lensSize / 2, 0, Math.PI * 2);
      ctx.clip();

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, lensSize, lensSize);
    },
    [enabled, zoom, lensSize]
  );

  const onMouseLeave = useCallback(() => setLens(null), []);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseMove={updateLens}
      onMouseLeave={onMouseLeave}
      style={{ cursor: enabled ? "none" : "default" }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        crossOrigin="anonymous"
        className="mx-auto max-h-[75vh] object-contain"
      />

      {/* Hidden canvas used to render the zoomed region */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Lens overlay — positioned via fixed so it's never clipped */}
      {enabled && lens && canvasRef.current && (
        <div
          className="pointer-events-none fixed rounded-full border-2 border-white shadow-lg"
          style={{
            width: lensSize,
            height: lensSize,
            left:
              (imgRef.current?.getBoundingClientRect().left ?? 0) +
              lens.x -
              lensSize / 2,
            top:
              (imgRef.current?.getBoundingClientRect().top ?? 0) +
              lens.y -
              lensSize / 2,
            backgroundImage: `url(${canvasRef.current.toDataURL()})`,
            backgroundSize: `${lensSize}px ${lensSize}px`,
          }}
        />
      )}
    </div>
  );
}
