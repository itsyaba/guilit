'use client'

import { useState, useEffect } from 'react'
import type { AdminQueueItem, ModerationDecision } from '@/lib/types'
import { QUEUE_REASON_LABELS, QUEUE_REASON_CLASSES } from '@/lib/moderation'
import { formatDistanceToNow } from 'date-fns'

interface QueueWorkspaceProps {
  initialItems: AdminQueueItem[]
  total: number
}

interface EditableFields {
  titleEn: string
  titleAm: string
  priceEtb: string
  categorySlug: string
  locationArea: string
}

export function QueueWorkspace({ initialItems, total }: QueueWorkspaceProps) {
  const [items, setItems] = useState<AdminQueueItem[]>(initialItems)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [edits, setEdits] = useState<Partial<EditableFields>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      switch (e.key.toLowerCase()) {
        case 'j': setSelectedIndex(i => Math.min(i + 1, items.length - 1)); break
        case 'k': setSelectedIndex(i => Math.max(i - 0 - 1, 0)); break
        case 'a': if (!editMode) handleAction('approve'); break
        case 'e': 
          e.preventDefault()
          setEditMode(em => !em)
          break
        case 'r': if (!editMode) handleAction('reject'); break
        case 'b':
          // No channel to ban on a native post.
          if (!editMode && items[selectedIndex]?.channel) handleAction('ban_channel')
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [items, selectedIndex, editMode, edits])

  async function handleAction(action: ModerationDecision) {
    const item = items[selectedIndex]
    if (!item || loading) return

    setLoading(true)
    try {
      await fetch(`/api/admin/queue/${item.listingId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action, 
          edits: action === 'approve_with_edits' ? edits : undefined 
        })
      })
      
      setItems(prev => prev.filter((_, i) => i !== selectedIndex))
      setSelectedIndex(prev => Math.min(prev, items.length - 2 >= 0 ? items.length - 2 : 0))
      setEditMode(false)
      setEdits({})
    } catch (err) {
      console.error('Failed to submit decision', err)
      alert('Failed to submit decision')
    } finally {
      setLoading(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <div className="text-center">
          <div className="text-4xl mb-4">🎉</div>
          <h2 className="text-xl font-medium text-zinc-900">Queue Cleared</h2>
          <p className="mt-1">No pending items to moderate.</p>
        </div>
      </div>
    )
  }

  const currentItem = items[selectedIndex]

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left List */}
      <div className="w-80 shrink-0 border-r border-zinc-200 bg-zinc-50/50 overflow-y-auto">
        {items.map((item, i) => {
          const isSelected = i === selectedIndex
          return (
            <button
              key={item.listingId}
              onClick={() => {
                setSelectedIndex(i)
                setEditMode(false)
                setEdits({})
              }}
              className={`w-full text-left p-4 border-b border-zinc-200 transition-colors ${
                isSelected ? 'bg-white shadow-sm ring-1 ring-inset ring-primary z-10 relative' : 'hover:bg-zinc-100'
              }`}
            >
              <div className="flex items-start justify-between mb-1 gap-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${QUEUE_REASON_CLASSES[item.queueReason]}`}>
                  {QUEUE_REASON_LABELS[item.queueReason]}
                </span>
                {item.source === 'scraped' ? (
                  <span className={`text-xs font-mono font-medium ${
                    item.confidenceScore >= 0.8 ? 'text-green-600' :
                    item.confidenceScore >= 0.6 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {(item.confidenceScore * 100).toFixed(0)}%
                  </span>
                ) : (
                  /* Native posts were typed by a person — no extraction, so no
                     confidence score to show. A percentage here would be a lie. */
                  <span className="text-xs font-medium text-zinc-500">Native</span>
                )}
              </div>
              <div className="font-medium text-sm text-zinc-900 line-clamp-2 mb-1">
                {item.titleEn || item.titleAm || 'Untitled'}
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>
                  {item.channel
                    ? `@${item.channel.username}`
                    : item.seller?.username
                      ? `@${item.seller.username}`
                      : 'New seller'}
                </span>
                <span>{formatDistanceToNow(new Date(item.queuedAt), { addSuffix: true })}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Right Detail Panel */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <div className="flex-1 overflow-y-auto p-6 flex gap-6">
          {/* Source — the Telegram post for scraped items, the seller's own
              photos for a native post. Same slot, different evidence. */}
          <div className="flex-1 min-w-0 space-y-4">
            {currentItem.rawMessage ? (
              <>
                <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider">Raw Message</h3>
                <div className="bg-zinc-900 text-zinc-50 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap overflow-x-auto shadow-inner">
                  {currentItem.rawMessage.mediaRefs && currentItem.rawMessage.mediaRefs.length > 0 && (
                    <div className="mb-4 p-2 bg-zinc-800 rounded border border-zinc-700 text-xs text-zinc-400 flex items-center gap-2">
                      📎 Contains {currentItem.rawMessage.mediaRefs.length} media attachment(s)
                    </div>
                  )}
                  {currentItem.rawMessage.rawText}
                </div>
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider">Seller&apos;s Photos</h3>
                {currentItem.images.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {currentItem.images.map((url) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={url}
                        src={url}
                        alt=""
                        className="aspect-4/3 w-full rounded-lg border border-zinc-200 object-cover"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 italic">No photos attached.</p>
                )}

                {currentItem.extraction.descriptionEn ? (
                  <p className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800">
                    {currentItem.extraction.descriptionEn}
                  </p>
                ) : null}

                <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Seller</div>
                  <dl className="space-y-1 text-zinc-800">
                    <Row label="Account" value={currentItem.seller?.username ? `@${currentItem.seller.username}` : '—'} />
                    <Row label="Phone" value={currentItem.seller?.phone ?? '—'} />
                    <Row
                      label="Phone verified"
                      value={currentItem.seller?.phoneVerified ? 'Yes' : 'No'}
                    />
                    <Row label="Trust level" value={currentItem.seller?.trustLevel ?? '—'} />
                    <Row
                      label="Member since"
                      value={
                        currentItem.seller?.memberSince
                          ? formatDistanceToNow(new Date(currentItem.seller.memberSince), { addSuffix: true })
                          : '—'
                      }
                    />
                  </dl>
                </div>
              </>
            )}
          </div>

          {/* Extracted Data */}
          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-wider">
                {currentItem.source === 'native' ? 'Listing Fields' : 'Extracted Data'}
              </h3>
              <button
                onClick={() => setEditMode(!editMode)}
                className="text-xs font-medium text-primary hover:underline"
              >
                {editMode ? 'Cancel Edit (E)' : 'Edit Mode (E)'}
              </button>
            </div>
            
            <div className="space-y-3 bg-zinc-50 border border-zinc-200 rounded-lg p-4">
              <Field
                label="Title (EN)"
                value={editMode && edits.titleEn !== undefined ? edits.titleEn : currentItem.titleEn || ''}
                isEdit={editMode}
                onChange={v => setEdits(e => ({ ...e, titleEn: v }))}
              />
              <Field
                label="Title (AM)"
                value={editMode && edits.titleAm !== undefined ? edits.titleAm : currentItem.titleAm || ''}
                isEdit={editMode}
                onChange={v => setEdits(e => ({ ...e, titleAm: v }))}
              />
              <Field
                label="Price (ETB)"
                value={editMode && edits.priceEtb !== undefined ? edits.priceEtb : String(currentItem.priceEtb || '')}
                isEdit={editMode}
                onChange={v => setEdits(e => ({ ...e, priceEtb: v }))}
              />
              <Field
                label="Category Slug"
                value={editMode && edits.categorySlug !== undefined ? edits.categorySlug : currentItem.categorySlug || ''}
                isEdit={editMode}
                onChange={v => setEdits(e => ({ ...e, categorySlug: v }))}
              />
              <Field
                label="Location"
                value={editMode && edits.locationArea !== undefined ? edits.locationArea : currentItem.extraction.locationArea || ''}
                isEdit={editMode}
                onChange={v => setEdits(e => ({ ...e, locationArea: v }))}
              />
              <div className="pt-2 border-t border-zinc-200 mt-2">
                <div className="text-xs text-zinc-500 mb-1">Phone</div>
                <div className="font-medium text-sm text-zinc-900">{currentItem.extraction.phoneNormalized || currentItem.extraction.phoneRaw || 'None'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="shrink-0 border-t border-zinc-200 bg-white p-4 flex items-center justify-between">
          <div className="text-xs text-zinc-500 flex gap-4">
            <span><kbd className="font-mono bg-zinc-100 px-1 py-0.5 rounded border border-zinc-200">J</kbd> Next</span>
            <span><kbd className="font-mono bg-zinc-100 px-1 py-0.5 rounded border border-zinc-200">K</kbd> Prev</span>
          </div>
          <div className="flex gap-2">
            {currentItem.channel ? (
              <button
                disabled={loading}
                onClick={() => handleAction('ban_channel')}
                className="px-4 py-2 text-sm font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-md transition-colors"
              >
                Ban Channel (B)
              </button>
            ) : null}
            <button
              disabled={loading}
              onClick={() => handleAction('reject')}
              className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors"
            >
              Reject (R)
            </button>
            <button
              disabled={loading}
              onClick={() => handleAction(editMode ? 'approve_with_edits' : 'approve')}
              className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-md transition-colors"
            >
              {editMode ? 'Approve with Edits' : 'Approve (A)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ 
  label, 
  value, 
  isEdit, 
  onChange 
}: { 
  label: string
  value: string
  isEdit: boolean
  onChange: (v: string) => void 
}) {
  return (
    <div>
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      {isEdit ? (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full text-sm border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      ) : (
        <div className="text-sm font-medium text-zinc-900 break-words">{value || <span className="text-zinc-400 italic">Empty</span>}</div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-sm font-medium text-zinc-900 break-words">{value}</dd>
    </div>
  )
}
