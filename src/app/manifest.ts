import type { MetadataRoute } from "next";

/** Lets the site be added to a home screen and open without browser chrome. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "mox",
    short_name: "mox",
    description: "What's on tonight, and where to watch it.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f0e",
    theme_color: "#0b0f0e",
    orientation: "portrait",
    icons: [
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      /* Android crops a maskable icon to whatever shape the launcher uses, so
         this one is square corner to corner — a rounded tile inside a rounded
         mask leaves a dark rim. The ring is 69% of the side, inside the 80% a
         mask may keep. */
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
