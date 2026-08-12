import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#f9fafb",
    categories: ["business", "productivity"],
    description:
      "Installable iD30 CRM workspace for sales, marketing and client operations.",
    display: "standalone",
    icons: [
      {
        sizes: "192x192",
        src: "/icons/icon-192.png",
        type: "image/png",
      },
      {
        sizes: "512x512",
        src: "/icons/icon-512.png",
        type: "image/png",
      },
      {
        purpose: "maskable",
        sizes: "512x512",
        src: "/icons/maskable-icon-512.png",
        type: "image/png",
      },
    ],
    id: "/",
    name: "iD30 CRM",
    orientation: "any",
    scope: "/",
    short_name: "iD30 CRM",
    start_url: "/",
    theme_color: "#101828",
  };
}
