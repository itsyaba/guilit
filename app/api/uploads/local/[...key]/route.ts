import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { NextRequest } from "next/server"

import { requireSessionUser, UnauthorizedError } from "@/lib/session"
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_MIME_TYPES,
  isR2,
  ownsMediaKey,
  resolveLocalPath,
} from "@/lib/storage"

/**
 * PUT /api/uploads/local/{key}
 *
 * Local-disk stand-in for a presigned R2 PUT, so the posting flow works with
 * no R2 credentials (make dev, CI, offline demo prep). lib/storage.ts points
 * clients here whenever STORAGE_BACKEND is not "r2"; the written file is then
 * served back by the existing GET /api/media/{key} route.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  if (isR2()) {
    return Response.json(
      { error: "Uploads go directly to R2 in this environment." },
      { status: 404 }
    )
  }

  let user
  try {
    user = await requireSessionUser()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in." }, { status: 401 })
    }
    throw error
  }

  const { key } = await params
  const joined = key.join("/")
  if (!ownsMediaKey(joined, user.id)) {
    return Response.json({ error: "Not your upload key." }, { status: 403 })
  }

  const contentType = request.headers.get("content-type") ?? ""
  if (!UPLOAD_MIME_TYPES[contentType]) {
    return Response.json({ error: "Unsupported image type." }, { status: 400 })
  }

  const body = Buffer.from(await request.arrayBuffer())
  if (body.byteLength === 0 || body.byteLength > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Photo is empty or too large." }, { status: 400 })
  }

  const filePath = resolveLocalPath(joined)
  if (!filePath) {
    return Response.json({ error: "Invalid key." }, { status: 400 })
  }

  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, body)

  return Response.json({ key: joined }, { status: 201 })
}
