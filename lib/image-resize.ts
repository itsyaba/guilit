/**
 * Client-side photo downscaling, run before anything is uploaded.
 *
 * Phone cameras produce 4–12MB JPEGs. On Addis mobile data that's the
 * difference between a listing posted and a listing abandoned, so we resize in
 * the browser and only ever put a few hundred KB on the wire.
 *
 * Browser-only — uses createImageBitmap/canvas. Import from client components.
 */

/** Longest edge after resize. Comfortably above what any listing card renders. */
const MAX_EDGE = 1600

/** Target ceiling per photo. Quality steps down until the blob fits. */
const TARGET_BYTES = 400_000

const QUALITY_STEPS = [0.82, 0.72, 0.62, 0.5]

export type ResizedPhoto = {
  blob: Blob
  contentType: string
  bytes: number
  /** Object URL for the local preview. Caller revokes it when done. */
  previewUrl: string
}

function encode(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Downscale and re-encode one file. Prefers WebP; falls back to JPEG when the
 * browser can't encode WebP (older Safari returns null or a PNG-typed blob).
 *
 * Returns null if the file isn't a decodable image.
 */
export async function resizePhoto(file: File): Promise<ResizedPhoto | null> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return null
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))

  const context = canvas.getContext("2d")
  if (!context) {
    bitmap.close()
    return null
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  for (const type of ["image/webp", "image/jpeg"]) {
    for (const quality of QUALITY_STEPS) {
      const blob = await encode(canvas, type, quality)
      // A browser that can't encode `type` silently hands back another format.
      if (!blob || blob.type !== type) break
      if (blob.size <= TARGET_BYTES || quality === QUALITY_STEPS.at(-1)) {
        return {
          blob,
          contentType: type,
          bytes: blob.size,
          previewUrl: URL.createObjectURL(blob),
        }
      }
    }
  }

  return null
}

/** "312 KB" — shown per photo so upload size is verifiable on the phone itself. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  return `${Math.round(bytes / 1000)} KB`
}
