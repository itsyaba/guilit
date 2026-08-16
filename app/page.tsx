import { redirect } from "next/navigation"

/**
 * Browse is the product. The landing page belongs to a separate ticket, so the
 * root sends people straight to the thing they came for.
 */
export default function Home() {
  redirect("/browse")
}
