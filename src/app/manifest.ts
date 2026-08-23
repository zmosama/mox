import type { MetadataRoute } from "next";

/** Lets the site be added to a home screen and open without browser chrome. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "mox",
    short_name: "mox",
    description: "What's on tonight, and where to watch it.",
    start_url: "/",
    display: "standalone",
    background_color: "#07070a",
    theme_color: "#07070a",
    orientation: "portrait",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
