import Camera from "./components/Camera";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center gap-10 bg-black px-6 pt-16 pb-8 text-white">
      <h1 className="text-4xl font-semibold tracking-tight">Wedding Photos</h1>
      <Camera />
    </div>
  );
}
