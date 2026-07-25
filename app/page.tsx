import Image from "next/image";
import heroImage from "@/assets/img/DSC05857.jpg";
import Camera from "./components/Camera";
import DriveFolderButton from "./components/DriveFolderButton";
import NotificationToggle from "./components/NotificationToggle";

export default function Home() {
  return (
    <div className="flex flex-col bg-background text-foreground">
      <div className="relative h-[60dvh] w-full shrink-0 overflow-hidden">
        <Image
          src={heroImage}
          alt="Ellen and Brylle"
          fill
          preload
          sizes="100vw"
          className="object-cover"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 py-6">
        <h1 className="text-center font-display text-3xl font-semibold tracking-tight text-sage-700">
          Ellen and Brylle Wedding
        </h1>
        <Camera />
        <DriveFolderButton />
        <NotificationToggle />
      </div>
    </div>
  );
}
