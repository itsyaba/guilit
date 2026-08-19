'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AddChannelForm() {
  const [isOpen, setIsOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [telegramId, setTelegramId] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username) return
    setLoading(true)

    try {
      await fetch('/api/admin/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username, 
          telegramId: telegramId ? Number(telegramId) : undefined 
        })
      })
      setUsername('')
      setTelegramId('')
      setIsOpen(false)
      router.refresh()
    } catch (err) {
      console.error(err)
      alert('Failed to add channel')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 shadow transition-colors hover:bg-zinc-900/90"
      >
        Add Channel
      </button>
    )
  }

  return (
    <form onSubmit={onSubmit} className="bg-white p-4 rounded-lg border border-zinc-200 shadow-sm flex flex-col gap-3 min-w-[300px]">
      <h3 className="text-sm font-medium text-zinc-900">Add New Channel</h3>
      <div>
        <label className="text-xs text-zinc-500 block mb-1">Username (without @)</label>
        <input
          type="text"
          required
          placeholder="e.g. ethio_cars"
          value={username}
          onChange={e => setUsername(e.target.value)}
          className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <details className="group">
        <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-700">Advanced</summary>
        <div className="mt-2">
          <label className="text-xs text-zinc-500 block mb-1">Telegram ID (numeric)</label>
          <input
            type="number"
            placeholder="e.g. -100123456789"
            value={telegramId}
            onChange={e => setTelegramId(e.target.value)}
            className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </details>
      <div className="flex gap-2 justify-end mt-2">
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="px-3 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded transition-colors disabled:opacity-50"
        >
          {loading ? 'Adding...' : 'Add'}
        </button>
      </div>
    </form>
  )
}
