import Image from "next/image";
import { Camera as CameraIcon } from "lucide-react";
import logo from "@/assets/img/logo.png";
import Camera from "./components/Camera";
import ViewGalleryButton from "./components/ViewGalleryButton";
import RecentPhotosStrip from "./components/RecentPhotosStrip";
import NotificationToggle from "./components/NotificationToggle";
import GuestNameGate from "./components/GuestNameGate";
import { getRequestEventConfig } from "@/lib/event";
import { fetchEventPhotoLimit, fetchEventUploadsMode } from "@/lib/backendEvents";
import { isTodayInManila } from "@/lib/manilaDate";

export default async function Home() {
  const config = await getRequestEventConfig();

  if (!config) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
        <Image src={logo} alt="Albumo" className="h-8 w-auto" priority />
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
  const [photoLimit, uploadsMode] = await Promise.all([fetchEventPhotoLimit(slug), fetchEventUploadsMode(slug)]);
  // `disabled`/`always_open` are an admin override in either direction;
  // `automatic` (the default) falls back to the original design -- guests
  // may only upload on the event's own day.
  const canUpload = uploadsMode === "disabled" ? false : uploadsMode === "always_open" ? true : isTodayInManila(date);
  const uploadsPaused = uploadsMode === "disabled";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background px-5 pb-6 pt-5 text-foreground">
      <div className="flex shrink-0 items-center justify-between">
        <Image src={logo} alt="Albumo" className="h-8 w-auto" priority />
        <GuestNameGate />
      </div>

      <div className="flex shrink-0 flex-col items-center gap-4 pb-6 pt-8 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-600/30">
          <CameraIcon className="text-white" size={40} strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{eventName}</h1>
          <p className="mt-1 text-sm font-medium text-indigo-600">
            You&apos;re invited to add your photos
          </p>
        </div>
        <p className="max-w-xs text-sm text-gray-500">
          Every photo you add joins the shared event album instantly, for
          everyone to see.
        </p>
      </div>

      <div className="flex shrink-0 flex-col overflow-hidden rounded-2xl">
        <Camera
          eventName={eventName}
          photoLimit={photoLimit}
          canUpload={canUpload}
          eventDate={date}
          uploadsPaused={uploadsPaused}
        />
        <ViewGalleryButton photoLimit={photoLimit} />
      </div>

      <RecentPhotosStrip />

      <NotificationToggle eventName={eventName} photoLimit={photoLimit} />
    </div>
  );
}
