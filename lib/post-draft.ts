import type { PostDraft, PostFields } from "@/lib/types"

/**
 * Draft persistence for the native posting flow.
 *
 * A half-finished listing has to survive a refresh — on a phone, a background
 * tab getting evicted is the normal case, not the edge case.
 *
 * Note we persist uploaded r2 keys, never the File objects (not serialisable).
 * That's the reason photos upload before the form step: on rehydrate we can
 * rebuild the previews from the keys alone.
 */

const DRAFT_KEY = "gulit.post.draft"
const REASONING_DISMISSED_KEY = "gulit.post.reasoningDismissed"

export const EMPTY_FIELDS: PostFields = {
  titleEn: "",
  titleAm: "",
  descriptionEn: "",
  categorySlug: "",
  condition: "",
  priceEtb: "",
  negotiable: false,
  locationArea: "",
}

export function loadDraft(): PostDraft | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PostDraft
    if (!Array.isArray(parsed?.imageKeys) || !parsed?.fields) return null
    // Merge over EMPTY_FIELDS so a draft written by an older build, missing a
    // field added since, still rehydrates instead of rendering undefined.
    return { ...parsed, fields: { ...EMPTY_FIELDS, ...parsed.fields } }
  } catch {
    return null
  }
}

export function saveDraft(draft: PostDraft): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Private mode / quota. Losing the draft is survivable; crashing isn't.
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(DRAFT_KEY)
    window.localStorage.removeItem(REASONING_DISMISSED_KEY)
  } catch {
    // ignore
  }
}

export function isReasoningDismissed(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(REASONING_DISMISSED_KEY) === "1"
  } catch {
    return false
  }
}

export function dismissReasoning(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(REASONING_DISMISSED_KEY, "1")
  } catch {
    // ignore
  }
}
