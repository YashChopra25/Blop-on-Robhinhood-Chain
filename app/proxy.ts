import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content-Security-Policy with a nonce.
 *
 * Why this is not just a static header in `next.config.ts`: Next.js bootstraps
 * the App Router with **inline** scripts (`self.__next_r`, the flight-data
 * `self.__next_f.push(...)` chunks). A static `script-src 'self'` blocks them,
 * the bootstrap never runs, hydration never starts, and every client page hangs
 * on its loading state forever. The only two ways out are `'unsafe-inline'` —
 * which gives up most of what a CSP is for on a page that signs transactions —
 * or a per-request nonce, which is what this does.
 *
 * Next.js reads the nonce straight out of the CSP header we set here and
 * applies it to the framework scripts, the page bundles and its own inline
 * script and style tags automatically. Nothing in the app has to thread it
 * through manually.
 *
 * NOTE: nonces require dynamic rendering — a statically prerendered page is
 * built before any request exists, so it carries no nonce and its inline
 * scripts would be blocked. `app/layout.tsx` therefore sets
 * `export const dynamic = "force-dynamic"`. For this app that costs almost
 * nothing: every dashboard route is wallet-driven and renders a loading state
 * until the client hydrates anyway.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",

    // The directive that actually matters on a wallet-signing origin.
    // `strict-dynamic` lets the nonced bootstrap load the rest of the bundle
    // without whitelisting paths, and makes host-based bypasses useless.
    // React needs `eval` in development to rebuild server stacks; it does not
    // in production, so the escape hatch is dev-only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // React never uses inline event handler attributes, so onclick="…" and
    // friends can be refused outright.
    "script-src-attr 'none'",

    // Styles keep `'unsafe-inline'`: Tailwind's runtime injection, Radix and
    // Sonner all set inline styles, and a nonce would silently break them
    // (a nonce and 'unsafe-inline' cannot coexist — the nonce wins and the
    // inline styles are dropped). CSS injection is a far weaker primitive than
    // script execution, and script execution is fully locked down above.
    // The Google Font hosts are no longer needed for a stylesheet import —
    // `@solana/wallet-adapter-react-ui` pulled DM Sans that way and is gone.
    // `next/font/google` (Geist in app/layout.tsx) downloads and self-hosts at
    // build time, so both are served from 'self'.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",

    // blob: covers previews of documents decrypted in the browser.
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",

    // The user's RPC endpoint and their wallet's relay are both configurable,
    // so this cannot be narrowed to a fixed host list without breaking
    // self-hosted RPCs.
    //
    // Development additionally needs plain ws: for HMR, and plain http: for a
    // local node: Anvil and Hardhat serve JSON-RPC over http on port 8545,
    // which is a different origin from the app, so it is neither `'self'` nor
    // `https:` and every `eth_call` is refused with "Failed to fetch". The
    // loopback hosts are spelled out rather than allowing `http:` wholesale, so
    // this stays a localhost-only exception; production remains https/wss-only.
    `connect-src 'self' https: wss:${
      isDev ? " ws: http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*" : ""
    }`,

    "object-src 'none'",
    // blob: is required for the PDF preview: a decrypted document is handed to
    // an <iframe> as a blob: URL so the browser's built-in PDF viewer can
    // render it. With `frame-src 'none'` that frame is refused outright, which
    // is why images and video (covered by img-src/media-src) previewed fine and
    // PDFs came up blank.
    "frame-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Omitted in development: the dev server is plain http on localhost.
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  // Next.js extracts the nonce from the request-side CSP header during render.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Static assets and API responses gain nothing from a document CSP, and
      // prefetches are skipped so they do not burn a nonce that never renders.
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
