'use client'

import { useState } from 'react'

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

export function ChannelRow({ channel }: ChannelRowProps) {
  const [active, setActive] = useState(channel.active)
  const [loading, setLoading] = useState(false)

  async function toggleActive() {
    setLoading(true)
    const nextState = !active
    try {
      await fetch(`/api/admin/channels/${channel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextState })
      })
      setActive(nextState)
    } catch (err) {
      console.error(err)
      alert('Failed to update channel state')
    } finally {
      setLoading(false)
    }
  }

  const ratePercent = Math.round(channel.rejectRate * 100)
  const isHighReject = channel.rejectRate > 0.4

  return (
    <tr className="hover:bg-zinc-50 transition-colors">
      <td className="px-6 py-4 font-medium text-zinc-900">
        @{channel.username}
      </td>
      <td className="px-6 py-4 text-zinc-600 truncate max-w-[200px]">
        {channel.title}
      </td>
      <td className="px-6 py-4">
        <label className="relative inline-flex items-center cursor-pointer">
          <input 
            type="checkbox" 
            className="sr-only peer" 
            checked={active}
            onChange={toggleActive}
            disabled={loading}
          />
          <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary opacity-90 disabled:opacity-50"></div>
        </label>
      </td>
      <td className="px-6 py-4 text-right text-zinc-600">
        {channel.messageCount.toLocaleString()}
      </td>
      <td className="px-6 py-4 text-right text-zinc-600">
        {channel.listingCount.toLocaleString()}
      </td>
      <td className={`px-6 py-4 text-right font-medium ${isHighReject ? 'text-amber-600' : 'text-zinc-600'}`}>
        {ratePercent}%
      </td>
    </tr>
  )
}
