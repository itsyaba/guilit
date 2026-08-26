import type { NextConfig } from "next"

/**
 * The hosts next/image is allowed to optimise from.
 *
 * lib/media.ts returns an absolute URL for every photo as soon as
 * STORAGE_BACKEND=r2 and R2_PUBLIC_URL is set. next/image refuses to optimise a
 * host that is not listed here, and it does not fail loudly: the optimiser
 * answers `400 "url" parameter is not allowed`, the browser fires the img's
 * error event, and components/listing/listing-image.tsx turns that into its
 * no-photo state. Every listing with a photo then reads as a listing without
 * one, on every surface, with nothing in the logs to say why.
 *
 * So the allowlist is derived from the same environment variable lib/media.ts
 * reads, rather than hard-coded -- the two cannot disagree about which bucket
 * this deployment serves from. Read at build time, which is where Next wants
 * it; a bucket swap is a redeploy, same as any other config change.
 */
function mediaRemotePatterns(): NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
> {
  const configured = process.env.R2_PUBLIC_URL?.trim()
  if (!configured) return []

  try {
    const url = new URL(configured)
    return [
      {
        protocol: url.protocol.replace(":", "") as "http" | "https",
        hostname: url.hostname,
        // Empty string is what next expects for "the default port", and a path
        // prefix is kept: an S3-compatible public URL is often
        // https://host/storage/v1/object/public/bucket, and allowlisting that
        // host's whole path space would be wider than this app ever needs.
        port: url.port,
        pathname: `${url.pathname.replace(/\/+$/, "")}/**`,
      },
    ]
  } catch {
    // A malformed URL is a deployment mistake, not a reason to fail the build
    // -- media falls back to the /api/media proxy, which needs no allowlist.
    return []
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  // @tabler/icons-react is a barrel of ~5,900 modules. Without this, importing
  // six icons pulls a chunk that costs more to evaluate than every component on
  // the front page combined.
  experimental: {
    optimizePackageImports: ["@tabler/icons-react"],
    // Enables forbidden() in Server Components and Route Handlers → 403 page
    // via app/forbidden.tsx. See: next/dist/docs/01-app/03-api-reference/04-functions/forbidden.md
    authInterrupts: true,
  },
  images: {
    remotePatterns: mediaRemotePatterns(),
  },
}

export default nextConfig
