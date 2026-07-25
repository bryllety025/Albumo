import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ellen and Brylle Wedding",
    short_name: "E&B Wedding",
    description:
      "Take a photo and share it straight to our wedding Google Drive album.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f2",
    theme_color: "#48593f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
