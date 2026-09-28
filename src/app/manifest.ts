import type { MetadataRoute } from "next";

/** Makes the system installable ("Add to Home Screen") and open full-screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "weblly — ניהול לקוחות",
    short_name: "weblly",
    description: "ניהול לידים, לקוחות, פרויקטים ומשימות של הסטודיו.",
    lang: "he",
    dir: "rtl",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#1c2034",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
