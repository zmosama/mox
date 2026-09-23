import type { Metadata, Viewport } from "next";
import { Sora, IBM_Plex_Sans_Arabic } from "next/font/google";
import { GlassBar } from "@/components/GlassBar";
import "./globals.css";

// Sora carries the wordmark's geometry into the text: the same circular o
// and flat terminals, so the header and the sentence under it agree.
const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute addresses for shared links' previews.
  metadataBase: new URL(process.env.MOX_PUBLIC_URL ?? "https://mox.mosama.me"),
  title: "mox",
  description: "What's on tonight, and where to watch it.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "mox", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  /* Reach under the notch and the home indicator; the safe-area padding in
     globals.css keeps content clear of both. */
  viewportFit: "cover",
};

/**
 * No header: like the iPhone app, each screen carries its own title, the
 * account lives behind the avatar on Home, and the sections sit in the floating
 * glass bar at the bottom — on a phone and on a desktop alike.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${arabic.variable}`}>
      <body className="min-h-dvh">
        {/* pb leaves room for the floating bar plus the home indicator. */}
        <main className="mx-auto max-w-[1180px] px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6">
          {children}
        </main>
        <GlassBar />
      </body>
    </html>
  );
}
