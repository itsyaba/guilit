const TIPS = [
  "Meet in a public place in daylight — a café or a mall entrance, not a home.",
  "Bring someone with you, and tell a third person where you are going.",
  "Inspect and test the item before any money changes hands.",
  "Nobody legitimate needs a deposit before you have seen the item.",
]

/**
 * Meetup guidance sits in the contact flow, where the decision actually gets
 * made, rather than on a safety page nobody opens.
 */
export function SafetyNote() {
  return (
    <section
      aria-labelledby="safety-heading"
      className="rounded-lg border border-border bg-muted/40 p-4"
    >
      <h2 id="safety-heading" className="type-ledger text-foreground">
        Before you meet
      </h2>
      <ul className="mt-3 space-y-2">
        {TIPS.map((tip) => (
          <li
            key={tip}
            className="flex gap-2.5 text-xs leading-relaxed text-muted-foreground"
          >
            <span
              aria-hidden="true"
              className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground"
            />
            {tip}
          </li>
        ))}
      </ul>
    </section>
  )
}
