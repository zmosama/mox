"use client";

import { cn } from "@/lib/cn";

export type Service = {
  name: string;
  logo: string | null;
  /** Where to send you on that service. Null when we have no link for it. */
  url: string | null;
};

/**
 * A streaming service, as a logo you can press.
 *
 * `stopPropagation` matters: these sit inside cards and rows that open a detail
 * sheet on click, and without it pressing the logo opened the sheet instead of
 * the service.
 */
export function ServiceBadge({
  service,
  title,
  iconOnly = false,
  className,
}: {
  service: Service;
  title: string;
  iconOnly?: boolean;
  className?: string;
}) {
  /* Names the title, not just the service: these repeat down a page, and
     twenty links all reading "Open Netflix" tell a screen reader nothing. */
  const label = service.url
    ? `Open ${title} on ${service.name}`
    : `${title} on ${service.name}`;

  const inner = (
    <>
      {service.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- TMDB logo, already sized
        <img
          src={service.logo}
          alt={service.name}
          className="block size-[22px] rounded-[5px] object-cover"
        />
      ) : null}
      {iconOnly && service.logo ? null : (
        <span className="text-[10.5px] font-semibold">{service.name}</span>
      )}
    </>
  );

  const shape = cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md whitespace-nowrap",
    iconOnly && service.logo
      ? // Just the mark on its own shadow. This used to carry a 44px touch box
        // for the thumb, which painted a grey square over a third of the
        // poster — and the card behind it already opens the title, so the
        // badge is a shortcut rather than the only way through.
        "shadow-[0_1px_4px_rgb(0_0_0/0.6)]"
      : "border border-line-strong bg-raised px-2 py-[3px] text-ink-dim",
    service.url && !iconOnly ? "min-h-11 sm:min-h-0" : "",
    className,
  );

  if (!service.url) {
    return (
      <span className={shape} title={label}>
        {inner}
      </span>
    );
  }

  return (
    <a
      href={service.url}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      className={cn(shape, "transition hover:brightness-125")}
    >
      {inner}
    </a>
  );
}
