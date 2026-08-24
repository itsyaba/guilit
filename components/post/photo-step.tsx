"use client"

import * as React from "react"
import { IconCamera, IconTrash } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { formatBytes, resizePhoto } from "@/lib/image-resize"
import { cn } from "@/lib/utils"

const MAX_PHOTOS = 8

type Photo = {
  id: string
  previewUrl: string
  bytes: number
  contentType: string
  blob: Blob
  /** 0–100. Stays at 0 until the PUT starts. */
  progress: number
  key: string | null
  failed: boolean
}

/**
 * PUT one blob with real progress. fetch() gives no upload progress events,
 * so this is XHR on purpose — on mobile data an upload can take ten seconds
 * and a bar that doesn't move reads as a hang.
 */
function putWithProgress(
  url: string,
  blob: Blob,
  headers: Record<string, string>,
  onProgress: (percent: number) => void
): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value)
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300)
    xhr.onerror = () => resolve(false)
    xhr.onabort = () => resolve(false)
    xhr.send(blob)
  })
}

export function PhotoStep({
  onDone,
  onSkip,
}: {
  onDone: (keys: string[]) => void
  onSkip: () => void
}) {
  const [photos, setPhotos] = React.useState<Photo[]>([])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Object URLs leak until revoked; drop them when the step unmounts.
  React.useEffect(() => {
    return () => {
      setPhotos((current) => {
        current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
        return current
      })
    }
  }, [])

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""
    if (!files.length) return

    setError(null)
    setBusy(true)

    const room = MAX_PHOTOS - photos.length
    const accepted: Photo[] = []
    for (const file of files.slice(0, room)) {
      const resized = await resizePhoto(file)
      if (!resized) continue
      accepted.push({
        id: crypto.randomUUID(),
        previewUrl: resized.previewUrl,
        bytes: resized.bytes,
        contentType: resized.contentType,
        blob: resized.blob,
        progress: 0,
        key: null,
        failed: false,
      })
    }

    setBusy(false)
    if (!accepted.length) {
      setError("Those files couldn't be read as photos.")
      return
    }
    if (files.length > room) {
      setError(`Only the first ${MAX_PHOTOS} photos are used.`)
    }
    setPhotos((current) => [...current, ...accepted])
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const photo = current.find((item) => item.id === id)
      if (photo) URL.revokeObjectURL(photo.previewUrl)
      return current.filter((item) => item.id !== id)
    })
  }

  async function upload() {
    const pending = photos.filter((photo) => !photo.key)
    if (!pending.length) {
      onDone(photos.map((photo) => photo.key).filter((key): key is string => !!key))
      return
    }

    setBusy(true)
    setError(null)

    const res = await fetch("/api/uploads/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: pending.map((photo) => ({
          contentType: photo.contentType,
          size: photo.bytes,
        })),
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setBusy(false)
      setError(body.error ?? "Couldn't start the upload. Try again.")
      return
    }

    const { uploads } = (await res.json()) as {
      uploads: { key: string; uploadUrl: string; headers: Record<string, string> }[]
    }

    const uploaded = await Promise.all(
      pending.map(async (photo, index) => {
        const target = uploads[index]
        if (!target) return null
        const ok = await putWithProgress(
          target.uploadUrl,
          photo.blob,
          target.headers,
          (percent) =>
            setPhotos((current) =>
              current.map((item) =>
                item.id === photo.id ? { ...item, progress: percent } : item
              )
            )
        )
        setPhotos((current) =>
          current.map((item) =>
            item.id === photo.id
              ? { ...item, key: ok ? target.key : null, failed: !ok, progress: ok ? 100 : 0 }
              : item
          )
        )
        return ok ? target.key : null
      })
    )

    setBusy(false)

    // Keys already uploaded on a previous attempt, plus the ones just written.
    const keys = [
      ...photos.map((photo) => photo.key),
      ...uploaded,
    ].filter((key): key is string => !!key)

    if (keys.length) {
      onDone(keys)
    } else {
      setError("Upload failed. Check your connection and try again.")
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Add photos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Up to {MAX_PHOTOS}. They&rsquo;re shrunk on your phone before uploading, so
          this works on mobile data.
        </p>
      </div>

      {photos.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <li key={photo.id} className="space-y-1">
              <div className="relative aspect-4/3 overflow-hidden rounded-xl border border-border bg-muted">
                {/* Local object URL — next/image would proxy it pointlessly. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.previewUrl}
                  alt=""
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  disabled={busy}
                  aria-label="Remove photo"
                  className="absolute top-1.5 right-1.5 rounded-full bg-background/85 p-1.5 text-foreground backdrop-blur transition-colors hover:bg-background disabled:opacity-50"
                >
                  <IconTrash className="size-4" />
                </button>
                {photo.progress > 0 && photo.progress < 100 ? (
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-background/60">
                    <div
                      className="h-full bg-primary transition-[width]"
                      style={{ width: `${photo.progress}%` }}
                    />
                  </div>
                ) : null}
              </div>
              <p
                className={cn(
                  "text-xs text-muted-foreground",
                  photo.failed && "text-destructive"
                )}
              >
                {photo.failed
                  ? "Failed"
                  : photo.key
                    ? `Uploaded · ${formatBytes(photo.bytes)}`
                    : formatBytes(photo.bytes)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFiles}
        className="sr-only"
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={busy || photos.length >= MAX_PHOTOS}
        >
          <IconCamera className="size-4" />
          {photos.length ? "Add more" : "Choose photos"}
        </Button>
        <Button type="button" onClick={upload} disabled={busy || !photos.length}>
          {busy ? "Uploading…" : "Continue"}
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <button
        type="button"
        onClick={onSkip}
        className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Skip photos and type it myself
      </button>
    </div>
  )
}
