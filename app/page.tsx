import Image from "next/image";
import { Camera as CameraIcon } from "lucide-react";
import logo from "@/assets/img/logo.png";
import Camera from "./components/Camera";
import ViewGalleryButton from "./components/ViewGalleryButton";
import RecentPhotosStrip from "./components/RecentPhotosStrip";
import NotificationToggle from "./components/NotificationToggle";

const EVENT_NAME = process.env.NEXT_PUBLIC_EVENT_NAME || "Ellen and Brylle Wedding";

export default function Home() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background px-5 pb-6 pt-5 text-foreground">
      <div className="flex items-center justify-between">
        <Image src={logo} alt="Albumo" className="h-8 w-auto" priority />
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-600">
          {EVENT_NAME}
        </span>
      </div>

      <div className="flex flex-col items-center gap-4 pb-6 pt-8 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-600/30">
          <CameraIcon className="text-white" size={40} strokeWidth={1.75} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          You&apos;re invited to add your photos
        </h1>
        <p className="max-w-xs text-sm text-gray-500">
          Every photo you add joins the shared event album instantly, for
          everyone to see.
        </p>
      </div>

      <div className="flex flex-col overflow-hidden rounded-2xl">
        <Camera />
        <ViewGalleryButton />
      </div>

      <RecentPhotosStrip />

      <NotificationToggle />
    </div>
  );
}
