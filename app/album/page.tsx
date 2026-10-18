import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { getRequestEventConfig } from "@/lib/event";
import { fetchEventAlbums } from "@/lib/backendEvents";
import { albumPageUrl } from "@/lib/album";

// The albums the event owner has shared. With just the one there is nothing to choose, so it opens straight away.
export default async function AlbumsPage() {
  const config = await getRequestEventConfig();
  // The home page says what to do without an invite link.
  if (!config) redirect("/");

  const albums = await fetchEventAlbums(config.slug);
  if (albums.length === 1) redirect(`/album/${albums[0].id}`);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto text-foreground">
      <div className="flex shrink-0 items-center px-4 py-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-2 text-sm font-medium text-foreground hover:bg-foreground/10"
        >
          <ArrowLeft size={18} strokeWidth={1.75} />
          Back
        </Link>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-5 pb-8">
        <h1 className="font-display text-2xl tracking-tight" style={{ fontWeight: "var(--heading-weight, 700)" }}>
          Albums
        </h1>

        {albums.length === 0 ? (
          <p className="text-sm text-gray-500">There&apos;s no album to look through yet. Check back later.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {albums.map((album) => (
              <li key={album.id}>
                <Link
                  href={`/album/${album.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-sm transition-colors hover:bg-gray-100"
                >
                  <span className="h-20 w-16 shrink-0 overflow-hidden rounded-sm bg-white shadow-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={albumPageUrl(album.id, 0, album.publishedAt)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{album.title || "Photo album"}</span>
                    <span className="block text-sm text-gray-500">
                      {album.pageCount - 2} {album.pageCount - 2 === 1 ? "page" : "pages"}
                    </span>
                  </span>
                  <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-gray-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
