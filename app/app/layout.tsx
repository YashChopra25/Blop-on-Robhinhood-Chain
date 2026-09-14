import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Nonce-based CSP requires dynamic rendering: a statically prerendered page is
 * built before any request exists, so it carries no nonce and its inline
 * bootstrap scripts get blocked. See `proxy.ts`.
 *
 * The cost here is close to zero — every route is wallet-driven and renders a
 * loading state until the client hydrates, so there was no meaningful static
 * content to prerender.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blop — Decentralized Inheritance on Robinhood Chain",
  description:
    "Your crypto, passed on automatically — no lawyers, no custody, no trust required. A trustless inheritance protocol on Robinhood Chain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
