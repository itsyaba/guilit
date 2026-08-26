"use client"

import { useCallback, useState, useEffect } from "react"
import {
  IconCheck,
  IconPencil,
  IconPhoto,
  IconPaperclip,
  IconX,
} from "@tabler/icons-react"
import { formatDistanceToNow } from "date-fns"

import { Eyebrow } from "@/components/kit"
import { QUEUE_REASON_LABELS, QUEUE_REASON_CLASSES } from "@/lib/moderation"
import type { AdminQueueItem, ModerationDecision } from "@/lib/types"
import { cn } from "@/lib/utils"

interface QueueWorkspaceProps {
  initialItems: AdminQueueItem[]
}

interface EditableFields {
  titleEn: string
  titleAm: string
  priceEtb: string
  categorySlug: string
  locationArea: string
}

/**
 * The moderation workspace: the list on the left, the evidence in the middle,
 * the extracted fields on the right, the decision along the bottom.
 *
 * The shape is dictated by the job. A moderator clears a queue of two hundred
 * by keeping their hands on J/K/A/R and their eyes on one column, so the three
 * panes never move, never reflow between items, and each scrolls on its own.
 * The action bar is pinned because a decision must never be a scroll away.
 */
export function QueueWorkspace({ initialItems }: QueueWorkspaceProps) {
  const [items, setItems] = useState<AdminQueueItem[]>(initialItems)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [edits, setEdits] = useState<Partial<EditableFields>>({})
  const [loading, setLoading] = useState(false)

  const handleAction = useCallback(
    async (action: ModerationDecision) => {
      const item = items[selectedIndex]
      if (!item || loading) return

      setLoading(true)
      try {
        await fetch(`/api/admin/queue/${item.listingId}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            edits: action === "approve_with_edits" ? edits : undefined,
          }),
        })

        setItems((prev) => prev.filter((_, i) => i !== selectedIndex))
        setSelectedIndex((prev) =>
          Math.min(prev, items.length - 2 >= 0 ? items.length - 2 : 0)
        )
        setEditMode(false)
        setEdits({})
      } catch (err) {
        console.error("Failed to submit decision", err)
        alert("Failed to submit decision")
      } finally {
        setLoading(false)
      }
    },
    [items, selectedIndex, loading, edits]
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return

      switch (e.key.toLowerCase()) {
        case "j":
          setSelectedIndex((i) => Math.min(i + 1, items.length - 1))
          break
        case "k":
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case "a":
          if (!editMode) handleAction("approve")
          break
        case "e":
          e.preventDefault()
          setEditMode((em) => !em)
          break
        case "r":
          if (!editMode) handleAction("reject")
          break
        case "b":
          // No channel to ban on a native post.
          if (!editMode && items[selectedIndex]?.channel)
            handleAction("ban_channel")
          break
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [items, selectedIndex, editMode, handleAction])

  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-[24rem] items-center justify-center rounded-shell bg-tray p-2 ring-1 ring-hairline">
        <div className="flex h-full w-full flex-col items-center justify-center rounded-panel bg-card px-6 py-16 text-center shadow-ambient ring-1 ring-hairline">
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-full bg-primary/8 ring-1 ring-hairline"
          >
            <IconCheck stroke={1.5} className="size-6 text-primary" />
          </span>
          <h2 className="type-display mt-6 text-xl font-semibold text-foreground">
            Queue cleared
          </h2>
          <p className="mt-2 text-base text-muted-foreground">
            Nothing is waiting for a decision.
          </p>
        </div>
      </div>
    )
  }

  const currentItem = items[selectedIndex]

  return (
    <div className="flex h-full min-h-0 gap-4">
      {/*
       * The list. Hidden below `lg` -- three panes on a 390px screen is one
       * pane and two slivers, and the decision matters more than the queue
       * order does on a phone.
       */}
      <div className="hidden w-80 shrink-0 lg:block">
        <div className="flex h-full min-h-0 flex-col rounded-shell bg-tray p-2 ring-1 ring-hairline">
          <div className="flex items-center justify-between px-3 py-2">
            <Eyebrow>Queue</Eyebrow>
            <span className="type-ledger text-muted-foreground">
              {selectedIndex + 1}/{items.length}
            </span>
          </div>

          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {items.map((item, i) => {
              const isSelected = i === selectedIndex
              return (
                <li key={item.listingId} className="min-w-0">
                  <button
                    onClick={() => {
                      setSelectedIndex(i)
                      setEditMode(false)
                      setEdits({})
                    }}
                    className={cn(
                      "w-full min-w-0 rounded-tile p-3 text-left",
                      "transition-[box-shadow,transform,background-color] duration-500 ease-fluid",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      isSelected
                        ? "bg-card shadow-ambient ring-1 ring-primary/40"
                        : "bg-card/50 ring-1 ring-hairline hover:bg-card hover:shadow-hairline"
                    )}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          "type-ledger type-mixed rounded-full px-2 py-0.5",
                          QUEUE_REASON_CLASSES[item.queueReason]
                        )}
                      >
                        {QUEUE_REASON_LABELS[item.queueReason]}
                      </span>
                      {item.source === "scraped" ? (
                        <span
                          className={cn(
                            "type-ledger shrink-0",
                            item.confidenceScore >= 0.8
                              ? "text-primary"
                              : item.confidenceScore >= 0.6
                                ? "text-flag-foreground"
                                : "text-destructive"
                          )}
                        >
                          {(item.confidenceScore * 100).toFixed(0)}%
                        </span>
                      ) : (
                        /* Native posts were typed by a person — no extraction, so no
                           confidence score to show. A percentage here would be a lie. */
                        <span className="type-ledger shrink-0 text-muted-foreground">
                          Native
                        </span>
                      )}
                    </div>

                    <div
                      lang="am"
                      className="line-clamp-2 text-sm font-medium text-foreground"
                    >
                      {item.titleEn || item.titleAm || "Untitled"}
                    </div>

                    <div className="type-ledger mt-2 flex items-center justify-between gap-2 text-muted-foreground">
                      <span className="truncate">
                        {item.channel
                          ? `@${item.channel.username}`
                          : item.seller?.username
                            ? `@${item.seller.username}`
                            : "New seller"}
                      </span>
                      <span className="shrink-0">
                        {formatDistanceToNow(new Date(item.queuedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* The item under review, and the decision. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-shell bg-tray p-2 ring-1 ring-hairline">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:flex-row lg:overflow-hidden">
          {/* Source — the Telegram post for scraped items, the seller's own
              photos for a native post. Same slot, different evidence. */}
          <div className="min-w-0 flex-1 rounded-panel bg-card p-5 shadow-ambient ring-1 ring-hairline lg:overflow-y-auto">
            {currentItem.rawMessage ? (
              <>
                <Eyebrow tone="quiet">Raw message</Eyebrow>
                {/* The one dark surface in the product. A Telegram post is
                    evidence, not content, and inverting it stops a moderator
                    reading the seller's own words as ours. `bg-foreground` is
                    the palette's zinc-900 -- no off-ramp colour needed. */}
                <div className="mt-4 rounded-tile bg-foreground p-4 font-mono text-sm whitespace-pre-wrap text-background">
                  {currentItem.rawMessage.mediaRefs &&
                    currentItem.rawMessage.mediaRefs.length > 0 && (
                      <div className="mb-4 flex items-center gap-2 rounded-xl bg-background/10 px-3 py-2 text-xs text-background/70">
                        <IconPaperclip
                          aria-hidden="true"
                          stroke={1.5}
                          className="size-4 shrink-0"
                        />
                        {currentItem.rawMessage.mediaRefs.length} media
                        attachment
                        {currentItem.rawMessage.mediaRefs.length === 1
                          ? ""
                          : "s"}
                      </div>
                    )}
                  {currentItem.rawMessage.rawText}
                </div>
              </>
            ) : (
              <>
                <Eyebrow tone="quiet">
                  <IconPhoto
                    aria-hidden="true"
                    stroke={1.5}
                    className="size-3.5"
                  />
                  Seller&apos;s photos
                </Eyebrow>

                {currentItem.images.length > 0 ? (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {currentItem.images.map((url) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={url}
                        src={url}
                        alt=""
                        className="aspect-4/3 w-full rounded-tile object-cover ring-1 ring-hairline"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No photos attached.
                  </p>
                )}

                {currentItem.extraction.descriptionEn ? (
                  <p className="mt-3 rounded-tile bg-tray p-3 text-sm whitespace-pre-wrap text-foreground ring-1 ring-hairline">
                    {currentItem.extraction.descriptionEn}
                  </p>
                ) : null}

                <div className="mt-3 rounded-tile bg-tray p-4 ring-1 ring-hairline">
                  <Eyebrow>Seller</Eyebrow>
                  <dl className="mt-3 space-y-2">
                    <Row
                      label="Account"
                      value={
                        currentItem.seller?.username
                          ? `@${currentItem.seller.username}`
                          : "—"
                      }
                    />
                    <Row
                      label="Phone"
                      value={currentItem.seller?.phone ?? "—"}
                    />
                    <Row
                      label="Phone verified"
                      value={currentItem.seller?.phoneVerified ? "Yes" : "No"}
                    />
                    <Row
                      label="Trust level"
                      value={currentItem.seller?.trustLevel ?? "—"}
                    />
                    <Row
                      label="Member since"
                      value={
                        currentItem.seller?.memberSince
                          ? formatDistanceToNow(
                              new Date(currentItem.seller.memberSince),
                              { addSuffix: true }
                            )
                          : "—"
                      }
                    />
                  </dl>
                </div>
              </>
            )}
          </div>

          {/* Extracted Data */}
          <div className="min-w-0 flex-1 rounded-panel bg-card p-5 shadow-ambient ring-1 ring-hairline lg:overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow tone="quiet">
                {currentItem.source === "native"
                  ? "Listing fields"
                  : "Extracted data"}
              </Eyebrow>
              <button
                onClick={() => setEditMode(!editMode)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                  "transition-[color,background-color] duration-500 ease-fluid",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  editMode
                    ? "bg-foreground/6 text-foreground"
                    : "text-muted-foreground hover:bg-tray hover:text-foreground"
                )}
              >
                {editMode ? (
                  <IconX aria-hidden="true" stroke={1.5} className="size-3.5" />
                ) : (
                  <IconPencil
                    aria-hidden="true"
                    stroke={1.5}
                    className="size-3.5"
                  />
                )}
                {editMode ? "Cancel (E)" : "Edit (E)"}
              </button>
            </div>

            <div className="mt-4 divide-y divide-hairline rounded-tile bg-tray px-4 ring-1 ring-hairline">
              <Field
                label="Title (EN)"
                value={
                  editMode && edits.titleEn !== undefined
                    ? edits.titleEn
                    : currentItem.titleEn || ""
                }
                isEdit={editMode}
                onChange={(v) => setEdits((e) => ({ ...e, titleEn: v }))}
              />
              <Field
                label="Title (AM)"
                value={
                  editMode && edits.titleAm !== undefined
                    ? edits.titleAm
                    : currentItem.titleAm || ""
                }
                isEdit={editMode}
                onChange={(v) => setEdits((e) => ({ ...e, titleAm: v }))}
              />
              <Field
                label="Price (ETB)"
                value={
                  editMode && edits.priceEtb !== undefined
                    ? edits.priceEtb
                    : String(currentItem.priceEtb || "")
                }
                isEdit={editMode}
                onChange={(v) => setEdits((e) => ({ ...e, priceEtb: v }))}
              />
              <Field
                label="Category slug"
                value={
                  editMode && edits.categorySlug !== undefined
                    ? edits.categorySlug
                    : currentItem.categorySlug || ""
                }
                isEdit={editMode}
                onChange={(v) => setEdits((e) => ({ ...e, categorySlug: v }))}
              />
              <Field
                label="Location"
                value={
                  editMode && edits.locationArea !== undefined
                    ? edits.locationArea
                    : currentItem.extraction.locationArea || ""
                }
                isEdit={editMode}
                onChange={(v) => setEdits((e) => ({ ...e, locationArea: v }))}
              />
              <Field
                label="Phone"
                value={
                  currentItem.extraction.phoneNormalized ||
                  currentItem.extraction.phoneRaw ||
                  "None"
                }
                isEdit={false}
                onChange={() => {}}
              />
            </div>
          </div>
        </div>

        {/* The decision. Pinned to the bottom of the tray, never scrolled. */}
        <div className="mt-2 flex shrink-0 flex-wrap items-center justify-between gap-3 px-2 py-2">
          <div className="type-ledger hidden items-center gap-3 text-muted-foreground sm:flex">
            <Key>J</Key> next
            <Key>K</Key> prev
            <Key>A</Key> approve
            <Key>R</Key> reject
          </div>

          <div className="flex flex-1 gap-2 sm:flex-none">
            {currentItem.channel ? (
              <Action
                onClick={() => handleAction("ban_channel")}
                disabled={loading}
                tone="danger"
              >
                Ban channel (B)
              </Action>
            ) : null}
            <Action
              onClick={() => handleAction("reject")}
              disabled={loading}
              tone="quiet"
            >
              Reject (R)
            </Action>
            <Action
              onClick={() =>
                handleAction(editMode ? "approve_with_edits" : "approve")
              }
              disabled={loading}
              tone="solid"
            >
              {editMode ? "Approve with edits" : "Approve (A)"}
            </Action>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * A decision button. Approve carries the weight, reject is quiet, ban is the
 * only place in the console that uses the destructive colour -- it is the one
 * action here that affects a channel rather than a row.
 */
function Action({
  onClick,
  disabled,
  tone,
  children,
}: {
  onClick: () => void
  disabled: boolean
  tone: "solid" | "quiet" | "danger"
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-11 flex-1 items-center justify-center rounded-full px-5 text-sm font-medium sm:flex-none",
        "transition-[transform,box-shadow,background-color] duration-500 ease-fluid",
        "active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring",
        tone === "solid" &&
          "bg-primary text-primary-foreground shadow-ambient hover:shadow-lift",
        tone === "quiet" &&
          "bg-card text-foreground ring-1 ring-hairline hover:shadow-hairline",
        tone === "danger" &&
          "bg-destructive/10 text-destructive hover:bg-destructive/15"
      )}
    >
      {children}
    </button>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md bg-card px-1.5 py-0.5 font-mono text-[0.6875rem] text-foreground ring-1 ring-hairline">
      {children}
    </kbd>
  )
}

function Field({
  label,
  value,
  isEdit,
  onChange,
}: {
  label: string
  value: string
  isEdit: boolean
  onChange: (v: string) => void
}) {
  return (
    <div className="py-3">
      <div className="type-ledger text-muted-foreground">{label}</div>
      {isEdit ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "mt-1.5 h-9 w-full rounded-full bg-card px-3.5 text-sm text-foreground ring-1 ring-hairline",
            "transition-shadow duration-500 ease-fluid",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          )}
        />
      ) : (
        <div
          lang="am"
          className="mt-1 text-sm font-medium break-words text-foreground"
        >
          {value || <span className="text-muted-foreground">Empty</span>}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="type-ledger text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words text-foreground">
        {value}
      </dd>
    </div>
  )
}
