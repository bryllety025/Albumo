import Link from "next/link";
import { LayoutGrid } from "lucide-react";

export default function ViewGalleryButton() {
  return (
    <Link
      href="/gallery"
      className="inline-flex items-center gap-2 rounded-full bg-sage-100 px-5 py-2.5 text-sm font-medium text-sage-900 transition-colors hover:bg-sage-100/70"
    >
      <LayoutGrid size={18} strokeWidth={1.75} />
      View All Photos
    </Link>
  );
}
