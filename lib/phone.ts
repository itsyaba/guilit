/**
 * Ethiopian mobile numbers are normalised to +251XXXXXXXXX on every write —
 * claim verification, native posting, anywhere a phone touches the DB.
 * Accepts local (09...), national (9...), and international (+2519...,
 * 2519...) input with arbitrary spaces/dashes.
 */
export function normalizeEthiopianPhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, "")

  let national = digits.startsWith("+") ? digits.slice(1) : digits
  if (national.startsWith("251")) national = national.slice(3)
  else if (national.startsWith("0")) national = national.slice(1)

  if (!/^[79]\d{8}$/.test(national)) {
    throw new Error(`Not a valid Ethiopian phone number: ${input}`)
  }

  return `+251${national}`
}
