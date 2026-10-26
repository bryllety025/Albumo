import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import UnlockForm from "../../components/UnlockForm";
import { ACCESS_COOKIE, hasAccess } from "@/lib/access";
import { verifyEventSlug } from "@/lib/backendEvents";

// Where proxy.ts sends a guest whose event link has a password they haven't given yet (or whose password the
// host changed since). Reached by redirect, never typed, so it's under /unlock/ -- two path segments, which
// the proxy never mistakes for an event's own link.
export default async function UnlockPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const event = await verifyEventSlug(slug);
  if (!event) notFound();

  // Nothing to ask: the host took the password off, or this device has already given it. The link itself
  // registers the device, so go there.
  const store = await cookies();
  if (hasAccess(event, store.get(ACCESS_COOKIE)?.value)) redirect(`/${encodeURIComponent(event.slug)}`);

  return <UnlockForm slug={event.slug} eventName={event.eventName} />;
}
