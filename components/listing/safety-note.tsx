import { Eyebrow, Shell } from "@/components/kit"

const TIPS = [
  "Meet in a public place in daylight — a café or a mall entrance, not a home.",
  "Bring someone with you, and tell a third person where you are going.",
  "Inspect and test the item before any money changes hands.",
  "Nobody legitimate needs a deposit before you have seen the item.",
]

/**
 * Meetup guidance sits in the contact flow, where the decision actually gets
 * made, rather than on a safety page nobody opens.
 *
 * Numbered rather than bulleted, and deliberately not coloured: four rules in
 * a warning-yellow box read as boilerplate to scroll past, and the one amber
 * in this product belongs to the price flag.
 */
export function SafetyNote() {
  return (
    <section aria-labelledby="safety-heading">
      <h2 id="safety-heading">
        <Eyebrow>Before you meet</Eyebrow>
      </h2>

      <Shell className="mt-4" coreClassName="p-5 sm:p-6">
        <ol className="grid gap-4 sm:grid-cols-2">
          {TIPS.map((tip, index) => (
            <li key={tip} className="flex gap-3">
              <span
                aria-hidden="true"
                className="type-ledger flex size-6 shrink-0 items-center justify-center rounded-full bg-tray text-muted-foreground"
              >
                {index + 1}
              </span>
              <span className="text-sm leading-relaxed text-muted-foreground">
                {tip}
              </span>
            </li>
          ))}
        </ol>
      </Shell>
    </section>
  )
}
