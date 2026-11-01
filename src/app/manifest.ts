import type { MetadataRoute } from "next";

// Installable PWA (PRD FND-06). Icons are placeholders from scripts/generate-icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rakan",
    short_name: "Rakan",
    description: "HR and payroll for Malaysian healthcare and therapy centres.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f3ea",
    theme_color: "#1e6b52",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
