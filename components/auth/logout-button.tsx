"use client"

import { useRouter } from "next/navigation"

export function LogoutButton() {
  const router = useRouter()

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={logout}
      className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
    >
      Log out
    </button>
  )
}
