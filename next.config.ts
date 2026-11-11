import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /* Every page here is rendered per account, so by default none is kept
       between navigations. Keeping one for 30 seconds makes going back to a
       screen just seen instant. A rating, a save or a follow made meanwhile
       would be missing from that copy, so `KeepFresh` in titleCache.ts asks
       again for a page reached within this long of one — keep its number in
       step with this one. */
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [
      {
        /* The service worker must never be served from a cache: a stale copy
           would go on handling notifications with yesterday's code. */
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
