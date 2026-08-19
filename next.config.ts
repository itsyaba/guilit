import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Enables forbidden() in Server Components and Route Handlers → 403 page
    // via app/forbidden.tsx. See: next/dist/docs/01-app/03-api-reference/04-functions/forbidden.md
    authInterrupts: true,
  },
}

export default nextConfig
