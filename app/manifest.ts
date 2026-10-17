import type { MetadataRoute } from "next";
import { getRequestEventConfig } from "@/lib/event";
import { fetchEventTheme } from "@/lib/eventTheme";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const config = await getRequestEventConfig();
  // The installed app's splash screen and title bar take the event's own colors.
  const theme = config ? await fetchEventTheme(config.slug) : null;

  return {
    name: config?.eventName ?? "Albumo",
    short_name: config?.eventShortName ?? "Albumo",
    description:
      "Take a photo and share it straight to our wedding photo album.",
    start_url: "/",
    display: "standalone",
    background_color: theme?.background ?? "#f7f7f8",
    theme_color: theme?.background ?? "#12131a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
