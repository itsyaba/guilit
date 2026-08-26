"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { IconPlus } from "@tabler/icons-react"

import { cn } from "@/lib/utils"

/**
 * Add a channel to the allowlist.
 *
 * Collapsed it is one pill; open it is a panel in the same tray-and-core
 * enclosure as everything else on the page, anchored where the button was. It
 * is not a modal: adding a channel is a thirty-second job done while looking at
 * the list you are adding to, and a dialog would cover exactly that list.
 */
export function AddChannelForm() {
  const [isOpen, setIsOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [telegramId, setTelegramId] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username) return
    setLoading(true)

    try {
      await fetch("/api/admin/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          telegramId: telegramId ? Number(telegramId) : undefined,
        }),
      })
      setUsername("")
      setTelegramId("")
      setIsOpen(false)
      router.refresh()
    } catch (err) {
      console.error(err)
      alert("Failed to add channel")
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "group/add inline-flex items-center gap-3 rounded-full bg-primary py-1.5 pr-1.5 pl-5",
          "text-sm font-medium text-primary-foreground shadow-ambient",
          "transition-[transform,box-shadow] duration-500 ease-fluid",
          "hover:shadow-lift active:scale-[0.985]",
          "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
        )}
      >
        Add channel
        <span
          aria-hidden="true"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/18",
            "transition-transform duration-500 ease-fluid group-hover/add:scale-105 group-hover/add:rotate-90"
          )}
        >
          <IconPlus stroke={1.5} className="size-4" />
        </span>
      </button>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full min-w-0 rounded-shell bg-tray p-2 ring-1 ring-hairline sm:w-80"
    >
      <div className="rounded-panel bg-card p-5 shadow-ambient ring-1 ring-hairline">
        <h2 className="type-ledger text-muted-foreground">New channel</h2>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-foreground">Username</span>
          <input
            type="text"
            required
            placeholder="ethio_cars"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={cn(
              "mt-2 h-10 w-full rounded-full bg-tray px-4 text-sm text-foreground ring-1 ring-hairline",
              "placeholder:text-muted-foreground/70",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            )}
          />
          <span className="mt-1.5 block text-xs text-muted-foreground">
            Without the @. The listener resolves the numeric id itself.
          </span>
        </label>

        <details className="group/adv mt-4">
          <summary className="type-ledger cursor-pointer list-none text-muted-foreground transition-colors duration-500 ease-fluid hover:text-foreground">
            Advanced
          </summary>
          <label className="mt-3 block">
            <span className="text-sm font-medium text-foreground">
              Telegram id
            </span>
            <input
              type="number"
              placeholder="-100123456789"
              value={telegramId}
              onChange={(e) => setTelegramId(e.target.value)}
              className={cn(
                "mt-2 h-10 w-full rounded-full bg-tray px-4 text-sm text-foreground tabular-nums ring-1 ring-hairline",
                "placeholder:text-muted-foreground/70",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              )}
            />
          </label>
        </details>

        <div className="mt-6 flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className={cn(
              "inline-flex h-11 flex-1 items-center justify-center rounded-full bg-primary px-5",
              "text-sm font-medium text-primary-foreground shadow-ambient",
              "transition-[transform,box-shadow] duration-500 ease-fluid",
              "hover:shadow-lift active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50",
              "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
            )}
          >
            {loading ? "Adding…" : "Add"}
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className={cn(
              "inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-card px-5",
              "text-sm font-medium text-muted-foreground ring-1 ring-hairline",
              "transition-[color,box-shadow] duration-500 ease-fluid",
              "hover:text-foreground hover:shadow-hairline",
              "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
            )}
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  )
}
