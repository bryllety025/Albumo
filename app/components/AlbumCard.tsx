import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { albumPageUrl, type GuestAlbum } from "@/lib/album";

// The way into the albums the event owner has shared, on the guest page. One album opens straight away; several
// go to a list of them.
export default function AlbumCard({ albums }: { albums: GuestAlbum[] }) {
  if (albums.length === 0) return null;

  const [first] = albums;
  const single = albums.length === 1;
  const photoPages = first.pageCount - 2;

  return (
    <Link
      href={single ? `/album/${first.id}` : "/album"}
      className="flex items-center gap-3 bg-surface px-4 py-3 transition-colors hover:bg-gray-100"
    >
      <span className="relative flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-white shadow-md">
        <BookOpen size={18} strokeWidth={1.75} className="text-gray-400" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={albumPageUrl(first.id, 0, first.publishedAt)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-foreground">
          {single ? "View the album" : "View the albums"}
        </span>
        <span className="block truncate text-sm text-gray-500">
          {single
            ? `${photoPages} ${photoPages === 1 ? "page" : "pages"} to flip through`
            : `${albums.length} albums to flip through`}
        </span>
      </span>
      <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-gray-300" />
    </Link>
  );
}
