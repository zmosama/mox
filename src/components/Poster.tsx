import { cn } from "@/lib/cn";
import { posterUrl, type PosterSize } from "@/lib/images";

/**
 * A poster, always at the right aspect and always at a size close to how large
 * it is actually drawn. The previous version requested every image at w342,
 * including 26px calendar thumbnails — about 90 oversized images per page.
 */
export function Poster({
  src,
  alt,
  size,
  className,
  fallback,
}: {
  src: string | null | undefined;
  alt: string;
  size: PosterSize;
  className?: string;
  /** Shown when TMDB has no artwork; an empty grey box reads as a bug. */
  fallback?: string;
}) {
  const base = "aspect-[2/3] object-cover bg-surface";

  if (!src) {
    const initials = (fallback ?? alt).slice(0, 2).toUpperCase();
    return (
      <div
        className={cn(
          base,
          "flex items-center justify-center border border-line-strong",
          "bg-gradient-to-br from-[#1b1f27] to-[#12151b]",
          "font-bold text-[#3d4450]",
          className,
        )}
        aria-label={alt}
      >
        <span className="text-[1.6em] leading-none">{initials}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- TMDB serves already-sized files
    <img
      src={posterUrl(src, size)}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn(base, className)}
    />
  );
}
