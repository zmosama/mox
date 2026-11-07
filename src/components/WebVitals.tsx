"use client";

import { useReportWebVitals } from "next/web-vitals";

/** /title/tv/1399 and /title/tv/66732 are one page to measure: ids become [id]. */
const route = (path: string) => path.replace(/\/\d+(?=\/|$)/g, "/[id]").replace(/\/u\/[^/]+/, "/u/[name]");

/* The page that was loaded is the page measured: LCP and CLS are only
   reported when it is hidden, by which time he may have moved on in the app,
   and the address bar names a page these numbers are not about. */
const landing = typeof window !== "undefined" ? route(window.location.pathname) : "";

/* Defined once, outside the component: a new function each render would be
   handed every metric again (see useReportWebVitals). */
const report = (metric: { name: string; value: number; rating?: string }) => {
  if (!["LCP", "INP", "CLS", "FCP", "TTFB"].includes(metric.name)) return;
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating ?? null,
    path: landing || route(window.location.pathname),
  });
  // A beacon survives the page being closed, which is when LCP and CLS settle.
  if (!navigator.sendBeacon?.("/api/vitals", new Blob([body], { type: "application/json" }))) {
    void fetch("/api/vitals", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
  }
};

/** Real-user speed: each page's Core Web Vitals, sent to our own server, nobody else's. */
export function WebVitals() {
  useReportWebVitals(report);
  return null;
}
