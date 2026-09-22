import type { Metadata, Viewport } from "next";
import { Sora, IBM_Plex_Sans_Arabic } from "next/font/google";
import { BottomNav } from "@/components/BottomNav";
import { Nav } from "@/components/Nav";
import { currentUser } from "@/lib/auth";
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
  title: "mox",
  description: "What's on tonight, and where to watch it.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "mox", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0f0e",
  width: "device-width",
  initialScale: 1,
  /* Reach under the notch and the home indicator; the safe-area padding in
     globals.css keeps content clear of both. */
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  return (
    <html lang="en" className={`${sora.variable} ${arabic.variable}`}>
      <body className="min-h-dvh">
        <Nav user={user} />
        {/* pb leaves room for the bottom bar plus the home indicator. */}
        <main className="mx-auto max-w-[1180px] px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pb-20 sm:pt-6">
          {children}
        </main>
        <BottomNav user={user} />
      </body>
    </html>
  );
}
