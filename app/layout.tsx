import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import { getRequestTenantConfig } from "@/lib/tenant";

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

// Reads the request's Host header (via the tenant it resolves to) so the
// title reflects whichever subdomain served the request, rather than a
// value baked in at build time.
export async function generateMetadata(): Promise<Metadata> {
  const { eventName } = await getRequestTenantConfig();

  return {
    title: eventName,
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

export const viewport: Viewport = {
  themeColor: "#12131a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} h-dvh antialiased`}
    >
      <body className="h-dvh flex flex-col overflow-hidden">{children}</body>
    </html>
  );
}
