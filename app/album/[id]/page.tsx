import { notFound, redirect } from "next/navigation";
import AlbumViewer from "../../components/AlbumViewer";
import { getRequestEventConfig } from "@/lib/event";
import { requireUnlocked } from "@/lib/access";
import { fetchEventAlbums, fetchEventGuestSettings } from "@/lib/backendEvents";
import { ALBUM_ID_PATTERN } from "@/lib/album";

// One album the event owner has shared, to flip through. Only an album albumo-backend lists for this event is
// shown, so an address made up by hand finds nothing.
export default async function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const config = await getRequestEventConfig();
  // The home page says what to do without an invite link.
  if (!config) redirect("/");
  await requireUnlocked(config.slug, await fetchEventGuestSettings(config.slug));
  if (!ALBUM_ID_PATTERN.test(id)) notFound();

  const album = (await fetchEventAlbums(config.slug)).find((candidate) => candidate.id === id);
  if (!album) notFound();

  return <AlbumViewer albumId={album.id} title={album.title} pageCount={album.pageCount} publishedAt={album.publishedAt} />;
}
