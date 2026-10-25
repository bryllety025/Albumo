import { ThumbsUp } from "lucide-react";
import Logo from "./components/Logo";
import EventHero from "./components/EventHero";
import Camera from "./components/Camera";
import ViewGalleryButton from "./components/ViewGalleryButton";
import RecentPhotosStrip from "./components/RecentPhotosStrip";
import NotificationToggle from "./components/NotificationToggle";
import AlbumCard from "./components/AlbumCard";
import GuestNameGate from "./components/GuestNameGate";
import HowToUse from "./components/HowToUse";
import { getRequestEventConfig } from "@/lib/event";
import { fetchEventAlbums, fetchEventPhotoQuota, fetchEventUploadsMode, fetchGuestAppFacebookUrl } from "@/lib/backendEvents";
import { fetchEventTheme } from "@/lib/eventTheme";
import { uploadWindow } from "@/lib/manilaDate";

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
  // default, how many photos it holds so far, and an admin's own
  // upload-policy choice) -- fresh calls every load, not part of the
  // long-lived event cookie. See fetchEventPhotoQuota's own comment for why.
  const [{ limit: photoLimit, used: photosUsed }, uploadsMode, facebookUrl, theme, albums] = await Promise.all([
    fetchEventPhotoQuota(slug),
    fetchEventUploadsMode(slug),
    fetchGuestAppFacebookUrl(),
    fetchEventTheme(slug),
    fetchEventAlbums(slug),
  ]);
  // `disabled`/`always_open` are an admin override in either direction;
  // `automatic` (the default) follows the event's date: the camera and the
  // camera roll on the event's own day, then only the camera roll for a few
  // days after it (a photo taken then wasn't taken at the event).
  const phase = uploadsMode === "disabled" ? "closed" : uploadsMode === "always_open" ? "event_day" : uploadWindow(date);
  const canTakePhoto = phase === "event_day";
  const canUpload = phase === "event_day" || phase === "after_event";
  const uploadsPaused = uploadsMode === "disabled";

  return (
    // No bg-background here: the body paints it, and a theme's gradient or
    // pattern (also on the body) has to show through.
    // overflow-x-hidden: scrolling this up and down must never also pan it sideways (it would
    // otherwise, since a vertical scroller scrolls both ways, as soon as anything is wider than the phone).
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden px-5 pb-6 pt-5 text-foreground">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <Logo className="h-8 w-auto" />
        <GuestNameGate />
      </div>

      <div className="flex shrink-0 flex-col items-center gap-4 pb-6 pt-8 text-center">
        <EventHero theme={theme} />
        <div className="w-full min-w-0">
          <h1
            className="break-words font-display tracking-tight"
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
          eventSlug={slug}
          photoLimit={photoLimit}
          photosUsed={photosUsed}
          canUpload={canUpload}
          canTakePhoto={canTakePhoto}
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
        <ViewGalleryButton />
      </div>

      <RecentPhotosStrip />

      <NotificationToggle eventName={eventName} photoLimit={photoLimit} photosUsed={photosUsed} />

      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <HowToUse photoLimit={photoLimit} facebookUrl={facebookUrl} canTakePhoto={canTakePhoto} />
        {facebookUrl && (
          <a
            href={facebookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-center text-xs font-medium text-gray-500"
          >
            <ThumbsUp size={13} strokeWidth={1.75} />
            Follow us on Facebook
          </a>
        )}
      </div>
    </div>
  );
}
