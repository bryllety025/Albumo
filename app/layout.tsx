import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { Bebas_Neue, Dancing_Script, Fredoka, Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import { getRequestEventConfig } from "@/lib/event";
import { fetchEventTheme } from "@/lib/eventTheme";
import { isDarkColor, themeStyleVars } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-display-serif",
  subsets: ["latin"],
});

// The other heading styles an event owner can pick (see lib/theme.ts). Not
// preloaded: most events use none of them, so each file is only fetched by a
// page whose heading actually uses it.
const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  preload: false,
});

const dancingScript = Dancing_Script({
  variable: "--font-dancing-script",
  subsets: ["latin"],
  preload: false,
});

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas-neue",
  subsets: ["latin"],
  weight: "400",
  preload: false,
});

// Reads the event this device is registered to (see lib/event.ts) so the
// title reflects whichever event's link the guest opened, rather than a
// value baked in at build time.
export async function generateMetadata(): Promise<Metadata> {
  const config = await getRequestEventConfig();

  return {
    title: config?.eventName ?? "Albumo",
    description:
      "Take a photo and share it straight to our wedding photo album.",
    icons: {
      icon: [
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [
        { url: "/icons/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" },
      ],
    },
  };
}

// The browser's own chrome (the status bar on a phone, the PWA title bar)
// takes the event's background, so a themed page doesn't sit under a
// mismatched dark strip.
export async function generateViewport(): Promise<Viewport> {
  const config = await getRequestEventConfig();
  const theme = config ? await fetchEventTheme(config.slug) : null;

  return { themeColor: theme?.background ?? "#12131a" };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const config = await getRequestEventConfig();
  const theme = config ? await fetchEventTheme(config.slug) : null;

  return (
    <html
      lang="en"
      // Lets globals.css show whichever logo reads on this background.
      data-tone={theme && isDarkColor(theme.background) ? "dark" : "light"}
      style={theme ? (themeStyleVars(theme) as CSSProperties) : undefined}
      className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} ${fredoka.variable} ${dancingScript.variable} ${bebasNeue.variable} h-dvh antialiased`}
    >
      <body className="h-dvh flex flex-col overflow-hidden">{children}</body>
    </html>
  );
}
