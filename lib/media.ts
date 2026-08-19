/**
 * r2_key is the stable identifier stored in the DB (see db/schema/images.ts);
 * this is the only place that turns it into a fetchable URL, so switching
 * storage backends is a config change, not a migration.
 */
export function getImageUrl(r2Key: string): string {
  // Seed/demo data stores root-relative paths (public/img/...) directly as
  // the "r2Key" — already a servable URL, nothing to build.
  if (r2Key.startsWith("/") || r2Key.startsWith("http")) return r2Key

  if (process.env.STORAGE_BACKEND === "r2" && process.env.R2_PUBLIC_URL) {
    return `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${r2Key}`
  }
  return `/api/media/${r2Key}`
}

/**
 * Prefix a client component can concatenate a key onto — same decision as
 * getImageUrl, but resolved once on the server, since STORAGE_BACKEND and
 * R2_PUBLIC_URL aren't NEXT_PUBLIC and so don't exist in the browser.
 */
export function getMediaBaseUrl(): string {
  if (process.env.STORAGE_BACKEND === "r2" && process.env.R2_PUBLIC_URL) {
    return `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/`
  }
  return "/api/media/"
}
