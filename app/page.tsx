import { ThumbsUp } from "lucide-react";
import Logo from "./components/Logo";
import EventHero from "./components/EventHero";
import Camera from "./components/Camera";
import ViewGalleryButton from "./components/ViewGalleryButton";
import RecentPhotosStrip from "./components/RecentPhotosStrip";
import NotificationToggle from "./components/NotificationToggle";
import AlbumCard from "./components/AlbumCard";
import GuestNameGate from "./components/GuestNameGate";
import { getRequestEventConfig } from "@/lib/event";
import { fetchEventAlbums, fetchEventPhotoLimit, fetchEventUploadsMode, fetchGuestAppFacebookUrl } from "@/lib/backendEvents";
import { fetchEventTheme } from "@/lib/eventTheme";
import { isTodayInManila } from "@/lib/manilaDate";

export default async function Home() {
  const config = await getRequestEventConfig();

  if (!config) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
        <Logo className="h-8 w-auto" />
        <h1 className="text-xl font-semibold">This link isn&apos;t recognized</h1>
        <p className="max-w-xs text-sm text-gray-500">
          Open the invite link you were sent to join an event&apos;s photo album.
        </p>
      </div>
    );
  }

  const { eventName, date, slug } = config;
  // Per-event (its photo-limit tier's own limit, or the account-wide
  // default, and an admin's own upload-policy choice) -- fresh calls every
  // load, not part of the long-lived event cookie. See fetchEventPhotoLimit's
  // own comment for why.
  const [photoLimit, uploadsMode, facebookUrl, theme, albums] = await Promise.all([
    fetchEventPhotoLimit(slug),
    fetchEventUploadsMode(slug),
    fetchGuestAppFacebookUrl(),
    fetchEventTheme(slug),
    fetchEventAlbums(slug),
  ]);
  // `disabled`/`always_open` are an admin override in either direction;
  // `automatic` (the default) falls back to the original design -- guests
  // may only upload on the event's own day.
  const canUpload = uploadsMode === "disabled" ? false : uploadsMode === "always_open" ? true : isTodayInManila(date);
  const uploadsPaused = uploadsMode === "disabled";

  return (
    // No bg-background here: the body paints it, and a theme's gradient or
    // pattern (also on the body) has to show through.
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-5 pb-6 pt-5 text-foreground">
      <div className="flex shrink-0 items-center justify-between">
        <Logo className="h-8 w-auto" />
        <GuestNameGate />
      </div>

      <div className="flex shrink-0 flex-col items-center gap-4 pb-6 pt-8 text-center">
        <EventHero theme={theme} />
        <div>
          <h1
            className="font-display tracking-tight"
            style={{
              fontSize: "calc(1.875rem * var(--heading-scale, 1))",
              fontWeight: "var(--heading-weight, 700)",
              lineHeight: 1.15,
            }}
          >
            {eventName}
          </h1>
          <p className="mt-1 text-sm font-medium text-indigo-600">
            You&apos;re invited to add your photos
          </p>
        </div>
        <p className="max-w-xs whitespace-pre-line break-words text-sm text-gray-500">
          {theme?.welcomeMessage ??
            "Every photo you add joins the shared event album instantly, for everyone to see."}
        </p>
      </div>

      {/* An album only exists once the owner has made it from the photos, so it comes before the camera: it is
          what a guest has come back for. */}
      {albums.length > 0 && (
        <div className="mb-4 flex shrink-0 flex-col overflow-hidden rounded-2xl shadow-sm ring-1 ring-foreground/10">
          <AlbumCard albums={albums} />
        </div>
      )}

      <div className="flex shrink-0 flex-col overflow-hidden rounded-2xl">
        <Camera
          eventName={eventName}
          photoLimit={photoLimit}
          canUpload={canUpload}
          eventDate={date}
          uploadsPaused={uploadsPaused}
          stamp={
            theme && theme.photoStamp !== "none"
              ? {
                  mode: theme.photoStamp,
                  style: theme.frameStyle,
                  width: theme.frameWidth,
                  color: theme.stampColor,
                  text: theme.stampText,
                  caption: theme.stampCaption,
                  theme: { accent: theme.accent, background: theme.background, foreground: theme.foreground },
                }
              : null
          }
        />
        <ViewGalleryButton photoLimit={photoLimit} />
      </div>

      <RecentPhotosStrip />

      <NotificationToggle eventName={eventName} photoLimit={photoLimit} />

      {facebookUrl && (
        <a
          href={facebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex shrink-0 items-center justify-center gap-1.5 text-center text-xs font-medium text-gray-500"
        >
          <ThumbsUp size={13} strokeWidth={1.75} />
          Follow us on Facebook
        </a>
      )}
    </div>
  );
}
