import type { NextRequest } from "next/server"

import { checkRateLimit } from "@/lib/rate-limit"
import { requireSessionUser, UnauthorizedError } from "@/lib/session"
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  UPLOAD_MIME_TYPES,
  nativeMediaKey,
  presignUpload,
  type PresignedUpload,
} from "@/lib/storage"

type RequestedFile = { contentType: string; size: number }

/**
 * POST /api/uploads/presign
 *
 * Hands back one presigned PUT per photo so the browser uploads straight to
 * R2 — the bytes never touch this server, and XHR upload progress works.
 *
 * The returned keys are namespaced by user id, which is what POST /api/listings
 * later checks before attaching them to a listing.
 */
export async function POST(request: NextRequest) {
  let user
  try {
    user = await requireSessionUser()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: "Log in with Telegram to upload photos." },
        { status: 401 }
      )
    }
    throw error
  }

  const body = await request.json().catch(() => null)
  const files: unknown = body?.files
  if (!Array.isArray(files) || files.length === 0) {
    return Response.json({ error: "files is required." }, { status: 400 })
  }
  if (files.length > MAX_UPLOAD_FILES) {
    return Response.json(
      { error: `At most ${MAX_UPLOAD_FILES} photos per listing.` },
      { status: 400 }
    )
  }

  const requested: RequestedFile[] = []
  for (const file of files) {
    const contentType = typeof file?.contentType === "string" ? file.contentType : ""
    const size = typeof file?.size === "number" ? file.size : -1

    if (!UPLOAD_MIME_TYPES[contentType]) {
      return Response.json(
        { error: `Unsupported image type: ${contentType || "unknown"}` },
        { status: 400 }
      )
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: `Each photo must be under ${Math.round(MAX_UPLOAD_BYTES / 1000)}KB.` },
        { status: 400 }
      )
    }
    requested.push({ contentType, size })
  }

  const allowed = await checkRateLimit(`presign:${user.id}`, 40, 600)
  if (!allowed) {
    return Response.json(
      { error: "Too many uploads. Try again in a few minutes." },
      { status: 429 }
    )
  }

  const uploads: PresignedUpload[] = await Promise.all(
    requested.map((file, index) =>
      presignUpload(
        nativeMediaKey(user.id, index, UPLOAD_MIME_TYPES[file.contentType]),
        file.contentType
      )
    )
  )

  return Response.json({ uploads })
}
