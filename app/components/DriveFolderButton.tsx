"use client";

import { useCallback, useState } from "react";
import { FolderOpen } from "lucide-react";

type Status = "idle" | "loading" | "error";

export default function DriveFolderButton() {
  const [status, setStatus] = useState<Status>("idle");

  const handleClick = useCallback(async () => {
    // Open the tab synchronously, in the same click-gesture tick, so
    // browsers like iOS Safari don't treat it as a popup and block it —
    // we redirect it once the URL resolves below.
    const win = window.open("", "_blank");
    setStatus("loading");
    try {
      const res = await fetch("/api/drive-folder");
      if (!res.ok) throw new Error(await res.text());
      const { url } = (await res.json()) as { url: string };
      if (win) win.location.href = url;
      setStatus("idle");
    } catch {
      win?.close();
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2500);
    }
  }, []);

  return (
    <button
      onClick={handleClick}
      disabled={status === "loading"}
      className="inline-flex items-center gap-2 rounded-full bg-sage-100 px-5 py-2.5 text-sm font-medium text-sage-900 transition-colors hover:bg-sage-100/70 disabled:opacity-50"
    >
      <FolderOpen size={18} strokeWidth={1.75} />
      {status === "error"
        ? "Couldn't open — tap to retry"
        : status === "loading"
          ? "Opening…"
          : "Open Google Drive Folder"}
    </button>
  );
}
