"use client"

import * as React from "react"

/**
 * The official Telegram Login Widget. It's a script tag that replaces
 * itself with an iframe button once loaded — that only happens if the
 * script element is inserted via the DOM API, not via innerHTML/JSX, so
 * this builds it imperatively in an effect.
 * https://core.telegram.org/widgets/login
 */
export function TelegramLoginButton({
  botUsername,
  authUrl,
}: {
  botUsername: string
  authUrl: string
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.innerHTML = ""

    const script = document.createElement("script")
    script.src = "https://telegram.org/js/telegram-widget.js?22"
    script.async = true
    script.setAttribute("data-telegram-login", botUsername)
    script.setAttribute("data-size", "large")
    script.setAttribute("data-auth-url", authUrl)
    script.setAttribute("data-request-access", "write")
    container.appendChild(script)
  }, [botUsername, authUrl])

  return <div ref={containerRef} />
}
