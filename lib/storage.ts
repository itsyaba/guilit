import { readFile } from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

/**
 * Write-side counterpart to lib/media.ts (which only builds read URLs).
 *
 * Config mirrors ingest/storage.py exactly so the Python scraper and the web
 * app address the same bucket — same endpoint derivation, same credentials,
 * same STORAGE_BACKEND switch. The only difference is the key prefix: the
 * scraper writes `raw/{channel}/...`, native posts write `native/{userId}/...`.
 */

/** Extensions we accept, keyed by the content type the browser reports. */
export const UPLOAD_MIME_TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
}

/** Server-side ceiling per photo. The client targets 400KB; this is headroom. */
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 600_000)

/** Max photos on a single listing — also enforced in POST /api/listings. */
export const MAX_UPLOAD_FILES = 8

export function isR2(): boolean {
  return process.env.STORAGE_BACKEND === "r2"
}

function localBaseDir(): string {
  // turbopackIgnore: an env-driven path.resolve makes Next's file tracer think
  // the whole project is a dependency of this module — it isn't.
  return path.resolve(
    /* turbopackIgnore: true */ process.env.LOCAL_STORAGE_DIR ?? "./data/media"
  )
}

/**
 * Resolve a key to an absolute local path, refusing anything that escapes the
 * media root. Same guard as app/api/media/[...key]/route.ts, shared so the
 * write path can't drift from the read path.
 */
export function resolveLocalPath(key: string): string | null {
  const baseDir = localBaseDir()
  const filePath = path.resolve(baseDir, key)
  if (filePath !== baseDir && !filePath.startsWith(baseDir + path.sep)) return null
  return filePath
}

let client: S3Client | null = null

function s3(): S3Client {
  if (client) return client

  const endpoint =
    process.env.R2_ENDPOINT_URL ||
    `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

  client = new S3Client({
    // R2 ignores the region and wants the literal "auto". Every other
    // S3-compatible store signs SigV4 against its real region and rejects
    // "auto" with SignatureDoesNotMatch — Supabase Storage among them.
    region: process.env.R2_REGION || "auto",
    endpoint,
    // Virtual-host addressing would resolve to <bucket>.<endpoint-host>, which
    // has no TLS certificate on Supabase Storage — the handshake fails before
    // any request is signed. Path-style is what both it and R2 accept.
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
  })
  return client
}

function bucket(): string {
  return process.env.R2_BUCKET_NAME ?? "guilit-media"
}

/**
 * Key layout for native posts: `native/{userId}/{uuid}-{index}.{ext}`.
 *
 * The userId segment is load-bearing — it's what lets the presign route and
 * POST /api/listings verify that a caller owns the keys they're attaching,
 * without a second round trip to the DB.
 */
export function nativeMediaKey(userId: string, index: number, ext: string): string {
  return `native/${userId}/${crypto.randomUUID()}-${index}.${ext}`
}

/** True when `key` belongs to this user's native-post namespace. */
export function ownsMediaKey(key: string, userId: string): boolean {
  return key.startsWith(`native/${userId}/`) && !key.includes("..")
}

export type PresignedUpload = {
  key: string
  uploadUrl: string
  headers: Record<string, string>
}

/**
 * A 5-minute presigned PUT. When R2 isn't configured (local dev, CI) we hand
 * back our own upload route instead, so the client code is identical either
 * way — same method, same headers, just a different host.
 */
export async function presignUpload(
  key: string,
  contentType: string
): Promise<PresignedUpload> {
  if (!isR2()) {
    return {
      key,
      uploadUrl: `/api/uploads/local/${key}`,
      headers: { "Content-Type": contentType },
    }
  }

  const uploadUrl = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: 300 }
  )
  return { key, uploadUrl, headers: { "Content-Type": contentType } }
}

/**
 * Read an object back as bytes — used by the autofill route to feed photos to
 * the vision model. Returns null rather than throwing so callers can fall
 * through to the manual form.
 */
export async function getObjectBytes(key: string): Promise<Buffer | null> {
  try {
    if (!isR2()) {
      const filePath = resolveLocalPath(key)
      if (!filePath) return null
      return await readFile(filePath)
    }

    const result = await s3().send(
      new GetObjectCommand({ Bucket: bucket(), Key: key })
    )
    const bytes = await result.Body?.transformToByteArray()
    return bytes ? Buffer.from(bytes) : null
  } catch {
    return null
  }
}
