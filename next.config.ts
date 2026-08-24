import type { NextConfig } from "next"

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
}

export default nextConfig
