import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Hebrew, IBM_Plex_Mono } from "next/font/google";
import { Providers } from "@/components/shell/providers";
import "./globals.css";

const plex = IBM_Plex_Sans_Hebrew({
  weight: ["400", "500", "600", "700"],
  subsets: ["hebrew", "latin"],
  variable: "--font-plex",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "weblly — ניהול לקוחות", template: "%s · weblly" },
  description: "מערכת לניהול לידים, לקוחות, פרויקטים, אפיונים ותשלומים לעסק לבניית אתרים.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1c2034",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${plex.variable} ${plexMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
