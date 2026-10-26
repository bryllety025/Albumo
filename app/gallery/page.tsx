import GalleryView from "../components/GalleryView";
import { requireUnlocked } from "@/lib/access";
import { fetchEventGuestSettings } from "@/lib/backendEvents";
import { getRequestEventConfig } from "@/lib/event";

export default async function GalleryPage() {
  const config = await getRequestEventConfig();
  // Without an invite link there is nothing to show; the gallery itself says so.
  const settings = config ? await fetchEventGuestSettings(config.slug) : null;
  if (config) await requireUnlocked(config.slug, settings);

  return <GalleryView allowDownloadAll={settings?.allowDownloadAll ?? false} />;
}
