"use client"

import * as React from "react"
import { IconCamera, IconPhotoPlus, IconTrash } from "@tabler/icons-react"

import { Eyebrow, Shell } from "@/components/kit"
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

/**
 * Step one: the photos.
 *
 * The panel is the drop target, not a small dashed rectangle inside it — on a
 * desktop the natural gesture is to drag a folder's worth of pictures onto the
 * thing you are looking at. On a phone there is no drag, so the same panel is
 * one big button into the camera roll.
 *
 * Photos are uploaded here rather than carried into the form as File objects,
 * because the draft in localStorage can only hold keys: a seller who reloads
 * mid-listing gets their photos back, and the vision call needs them in the
 * bucket anyway.
 */
export function PhotoStep({
  onDone,
  onSkip,
}: {
  onDone: (keys: string[]) => void
  onSkip: () => void
}) {
  const [photos, setPhotos] = React.useState<Photo[]>([])
  const [busy, setBusy] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
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

  /** Resize and accept a batch, from the picker or from a drop. */
  async function accept(files: File[]) {
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

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""
    await accept(files)
  }

  async function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (busy) return
    // Anything that isn't an image is ignored rather than rejected: dropping a
    // folder with a stray .txt in it should still add the pictures.
    await accept(
      Array.from(event.dataTransfer.files).filter((file) =>
        file.type.startsWith("image/")
      )
    )
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
      onDone(
        photos.map((photo) => photo.key).filter((key): key is string => !!key)
      )
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
      uploads: {
        key: string
        uploadUrl: string
        headers: Record<string, string>
      }[]
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
              ? {
                  ...item,
                  key: ok ? target.key : null,
                  failed: !ok,
                  progress: ok ? 100 : 0,
                }
              : item
          )
        )
        return ok ? target.key : null
      })
    )

    setBusy(false)

    // Keys already uploaded on a previous attempt, plus the ones just written.
    const keys = [...photos.map((photo) => photo.key), ...uploaded].filter(
      (key): key is string => !!key
    )

    if (keys.length) {
      onDone(keys)
    } else {
      setError("Upload failed. Check your connection and try again.")
    }
  }

  const full = photos.length >= MAX_PHOTOS

  return (
    <div className="space-y-4">
      <Shell
        className={cn(
          "transition-colors duration-500 ease-fluid",
          dragging && "bg-primary/8"
        )}
        coreClassName="p-6"
      >
        <div
          onDragOver={(event) => {
            event.preventDefault()
            if (!busy && !full) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <Eyebrow tone="quiet">Step one</Eyebrow>
              <h2 className="type-display mt-4 text-xl font-semibold text-foreground">
                Add photos
              </h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Up to {MAX_PHOTOS}. They&rsquo;re shrunk on your phone before
                uploading, so this works on mobile data — and we read them to
                fill in the details for you.
              </p>
            </div>
            <span className="type-ledger shrink-0 rounded-full bg-tray px-3 py-1.5 text-muted-foreground">
              {photos.length}/{MAX_PHOTOS}
            </span>
          </div>

          {photos.length ? (
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((photo, index) => (
                <li key={photo.id} className="min-w-0 space-y-1.5">
                  <div className="relative aspect-4/3 overflow-hidden rounded-tile bg-tray ring-1 ring-hairline">
                    {/* Local object URL — next/image would proxy it pointlessly. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.previewUrl}
                      alt=""
                      className="size-full object-cover"
                    />

                    {/* The first photo is the one the grid shows, so say so
                        here rather than letting a seller discover it later. */}
                    {index === 0 ? (
                      <span className="type-ledger absolute top-2 left-2 rounded-full bg-background/85 px-2 py-1 text-foreground backdrop-blur">
                        Cover
                      </span>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      disabled={busy}
                      aria-label="Remove photo"
                      className={cn(
                        "absolute top-2 right-2 flex size-8 items-center justify-center rounded-full",
                        "bg-background/85 text-foreground backdrop-blur",
                        "transition-[transform,background-color] duration-500 ease-fluid",
                        "hover:scale-105 hover:bg-background active:scale-95 disabled:opacity-50"
                      )}
                    >
                      <IconTrash
                        aria-hidden="true"
                        stroke={1.5}
                        className="size-4"
                      />
                    </button>

                    {photo.progress > 0 && photo.progress < 100 ? (
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-background/60">
                        <div
                          className="h-full bg-primary transition-[width] duration-300 ease-fluid"
                          style={{ width: `${photo.progress}%` }}
                        />
                      </div>
                    ) : null}
                  </div>

                  <p
                    className={cn(
                      "type-ledger truncate",
                      photo.failed
                        ? "text-destructive"
                        : "text-muted-foreground"
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
          ) : (
            /* The empty state is the drop target: a tall dashed panel that says
               what to do, on a surface the whole card already accepts drops on. */
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className={cn(
                "mt-6 flex w-full flex-col items-center gap-3 rounded-panel border border-dashed border-border",
                "bg-tray/60 px-6 py-14 text-center",
                "transition-colors duration-500 ease-fluid hover:bg-tray disabled:opacity-60"
              )}
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-card ring-1 ring-hairline">
                <IconPhotoPlus
                  aria-hidden="true"
                  stroke={1.5}
                  className="size-6 text-muted-foreground"
                />
              </span>
              <span className="text-sm font-medium text-foreground">
                Choose photos
              </span>
              {/* There is no drag gesture on a phone, so the hint that
                  mentions one starts at `sm`. */}
              <span className="type-ledger hidden text-muted-foreground sm:block">
                or drop them here
              </span>
            </button>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFiles}
            className="sr-only"
          />

          {error ? (
            <p className="mt-4 rounded-tile bg-destructive/10 px-4 py-3 text-sm text-destructive-strong">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={upload}
              disabled={busy || !photos.length}
              className={cn(
                "inline-flex h-11 items-center justify-center rounded-full bg-primary px-6",
                "text-sm font-medium text-primary-foreground shadow-ambient",
                "transition-[transform,box-shadow] duration-500 ease-fluid",
                "hover:shadow-lift active:scale-[0.985]",
                "disabled:pointer-events-none disabled:opacity-45",
                "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
              )}
            >
              {busy ? "Uploading…" : "Continue"}
            </button>

            {photos.length ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy || full}
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-full bg-card px-5",
                  "text-sm font-medium text-foreground ring-1 ring-hairline",
                  "transition-[box-shadow,transform] duration-500 ease-fluid",
                  "hover:shadow-hairline active:scale-[0.985]",
                  "disabled:pointer-events-none disabled:opacity-45",
                  "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
                )}
              >
                <IconCamera
                  aria-hidden="true"
                  stroke={1.5}
                  className="size-4"
                />
                Add more
              </button>
            ) : null}
          </div>
        </div>
      </Shell>

      <p className="text-center">
        <button
          type="button"
          onClick={onSkip}
          className={cn(
            "text-sm text-muted-foreground underline decoration-hairline underline-offset-4",
            "transition-colors duration-500 ease-fluid hover:text-foreground"
          )}
        >
          Skip photos and type it myself
        </button>
      </p>
    </div>
  )
}
