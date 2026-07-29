import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: process.env.NEXT_PUBLIC_EVENT_NAME || "Ellen and Brylle Wedding",
    short_name: process.env.NEXT_PUBLIC_EVENT_SHORT_NAME || "E&B Wedding",
    description:
      "Take a photo and share it straight to our wedding photo album.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f8",
    theme_color: "#12131a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
