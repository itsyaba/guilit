import { readFile } from "node:fs/promises"
import path from "node:path"
import type { NextRequest } from "next/server"

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
}

/**
 * Serves locally-stored media when STORAGE_BACKEND=local (see lib/media.ts).
 * In production with R2 configured, image URLs bypass this route entirely.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params
  // turbopackIgnore: an env-driven path.resolve makes Next's file tracer
  // think the whole project is a dependency of this route — it isn't.
  const baseDir = path.resolve(/* turbopackIgnore: true */ process.env.LOCAL_STORAGE_DIR ?? "./data/media")
  const filePath = path.resolve(baseDir, ...key)

  if (!filePath.startsWith(baseDir)) {
    return new Response("Not found", { status: 404 })
  }

  try {
    const file = await readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    return new Response(file, {
      headers: {
        "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
