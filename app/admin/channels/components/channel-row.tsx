"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"

interface ChannelRowProps {
  channel: {
    id: number
    username: string
    title: string
    active: boolean
    messageCount: number
    listingCount: number
    rejectRate: number
  }
}

/**
 * One channel. The capture switch writes immediately and keeps its own optimism
 * local to the row, so toggling one channel never re-renders a hundred.
 *
 * A high rejection rate is the one thing on this page worth acting on, so it is
 * the one thing that carries the flag amber -- the same colour the shopper-side
 * price warning uses, and used nowhere else here.
 */
export function ChannelRow({ channel }: ChannelRowProps) {
  const [active, setActive] = useState(channel.active)
  const [loading, setLoading] = useState(false)

  async function toggleActive() {
    setLoading(true)
    const nextState = !active
    try {
      await fetch(`/api/admin/channels/${channel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextState }),
      })
      setActive(nextState)
    } catch (err) {
      console.error(err)
      alert("Failed to update channel state")
    } finally {
      setLoading(false)
    }
  }

  const ratePercent = Math.round(channel.rejectRate * 100)
  const isHighReject = channel.rejectRate > 0.4

  return (
    <tr className="transition-colors duration-500 ease-fluid hover:bg-tray/60">
      <td className="px-6 py-4 font-medium text-foreground">
        @{channel.username}
      </td>
      <td className="max-w-[16rem] truncate px-6 py-4 text-muted-foreground">
        {channel.title}
      </td>
      <td className="px-6 py-4">
        <label className="inline-flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={active}
            onChange={toggleActive}
            disabled={loading}
            aria-label={`Capture from @${channel.username}`}
          />
          {/*
           * The track and the knob, both driven off `peer-checked`. The knob
           * translates rather than changing `left`, which is the difference
           * between a composited slide and a layout pass per frame.
           */}
          <span
            aria-hidden="true"
            className={cn(
              "relative h-6 w-10 shrink-0 rounded-full bg-muted ring-1 ring-hairline",
              "transition-colors duration-500 ease-fluid peer-checked:bg-primary",
              "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
              "peer-disabled:opacity-50",
              "after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-card after:shadow-hairline",
              "after:transition-transform after:duration-500 after:ease-fluid",
              "peer-checked:after:translate-x-4"
            )}
          />
          <span className="type-ledger text-muted-foreground">
            {active ? "On" : "Off"}
          </span>
        </label>
      </td>
      <td className="px-6 py-4 text-right text-muted-foreground tabular-nums">
        {channel.messageCount.toLocaleString()}
      </td>
      <td className="px-6 py-4 text-right text-muted-foreground tabular-nums">
        {channel.listingCount.toLocaleString()}
      </td>
      <td className="px-6 py-4 text-right">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium tabular-nums",
            isHighReject
              ? "bg-flag-surface text-flag-foreground"
              : "text-muted-foreground"
          )}
        >
          {ratePercent}%
        </span>
      </td>
    </tr>
  )
}
