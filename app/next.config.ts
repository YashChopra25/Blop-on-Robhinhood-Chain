import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Security headers (fixes H6).
 *
 * This origin asks people to sign EVM transactions, which makes it a prime
 * clickjacking and script-injection target — and the config was previously the
 * untouched scaffold, so none of these were set.
 *
 * The Content-Security-Policy is deliberately NOT here: it needs a fresh nonce
 * per request so that Next.js's own inline bootstrap scripts can run, and a
 * static header cannot carry one. A static `script-src 'self'` blocked those
 * scripts outright, which stopped hydration and left every client page spinning
 * forever. See `proxy.ts` for the real policy.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // The repo root holds an empty stub package-lock.json alongside the Anchor
  // workspace, which makes Turbopack's root auto-detection ambiguous. Pin it to
  // this directory so module resolution and the build cache stay deterministic.
  turbopack: { root: here },

  // Do not advertise the framework version to scanners.
  poweredByHeader: false,
  // Type errors fail the production build rather than shipping. (Linting is a
  // separate CI step; Next 16 no longer accepts an `eslint` key here.)
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
