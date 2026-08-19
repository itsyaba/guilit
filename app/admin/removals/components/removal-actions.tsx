'use client'

import { useState } from 'react'

export function RemovalActions({ id }: { id: number }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleAction(action: 'approve' | 'reject') {
    setLoading(true)
    try {
      await fetch(`/api/admin/removals/${id}/${action}`, {
        method: 'POST'
      })
      setDone(true)
    } catch (err) {
      console.error(err)
      alert('Failed to process request')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return <div className="text-sm font-medium text-zinc-400">Processed</div>
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handleAction('reject')}
        disabled={loading}
        className="px-3 py-1.5 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors disabled:opacity-50"
      >
        Reject Request
      </button>
      <button
        onClick={() => handleAction('approve')}
        disabled={loading}
        className="px-3 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-md transition-colors disabled:opacity-50"
      >
        Approve Takedown
      </button>
    </div>
  )
}
