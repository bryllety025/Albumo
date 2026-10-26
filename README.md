This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Albums

When the event owner saves an album in the dashboard, its pages are sent to `albumo-backend`
as pictures and kept in the bucket under `_albums/<slug>/<albumId>/<n>.jpg` (`n` from 0,
the cover). The guest page then shows a **View the album** card above the camera
(`app/components/AlbumCard.tsx`), which opens the album to flip through (`/album/<id>`,
`app/components/AlbumViewer.tsx`: two pages across the spine and a 3D page turn on a wide
screen, one page at a time with a slide on a phone). `/album` lists them when there is more
than one.

- The list comes from `GET /events/public/<slug>/albums` (`fetchEventAlbums` in
  `lib/backendEvents.ts`), live like the uploads mode, and only albums it lists open.
- The pictures are read straight from the bucket with this app's own credentials, through
  `app/api/album/[id]/[page]/route.ts` (`private`, cached for good: the `v` in each address
  is the time the pages were published). The credentials need `s3:GetObject` on
  `_albums/*`, as they already do for `_covers/*`.

## Guest settings

The event owner's settings (Guest settings in the dashboard) change what this app does,
all read live from `GET /events/public/<slug>` (`fetchEventGuestSettings` in
`lib/backendEvents.ts`):

- **Password.** With one set, `/<slug>` sends a new device to `/unlock/<slug>`
  (`app/components/UnlockForm.tsx`) instead of registering it. The form posts to
  `app/api/unlock/route.ts`, which asks albumo-backend whether the password is right
  (case doesn't matter), slows guessing down (10 wrong tries per visitor and event, then a
  10-minute wait; in memory, `lib/attempts.ts`) and, on success, sets `albumo_event` as
  before plus `albumo_access`. That cookie is `<stamp>.<signature>`: the stamp is the
  moment the owner last changed the password and the signature (HMAC with
  `EVENTS_API_KEY`) ties it to the slug, so it can't be forged, and changing or removing
  the password makes every device ask again. `lib/access.ts` has the checks: pages call
  `requireUnlocked`, API routes `guestGate` (settings cached for 15 s), and the upload
  route checks live. If albumo-backend can't be reached the check lets a device that
  already has the event cookie through, rather than locking a whole party out over a blip.
- **Required name.** `GuestNameGate` has no Skip and can't be dismissed, devices that
  skipped earlier are asked again, and `/api/upload` answers 400 `name_required` for a
  photo with no name (before anything reaches S3). The camera sends the stored name for
  photos that were queued without one.
- **Download all.** The gallery shows a bar with the button while the owner allows it.
  It first asks `/api/download-all?check=1` (so a refusal is a message, not a saved error
  page), then downloads `/api/download-all`, which streams albumo-backend's
  `GET /events/public/<slug>/media/zip` straight through. Over 2,000 files the bar says
  so instead (the backend's cap).

Deploy order: albumo-backend (with its `AddGuestSettingsToEvents` migration) first. This
app treats a backend that doesn't send the new fields as "no password, name optional,
no Download all".

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
