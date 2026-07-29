import type { MetadataRoute } from "next";
import { getRequestTenantConfig } from "@/lib/tenant";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { eventName, eventShortName } = await getRequestTenantConfig();

  return {
    name: eventName,
    short_name: eventShortName,
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
