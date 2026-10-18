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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
