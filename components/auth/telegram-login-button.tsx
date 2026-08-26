"use client"

import * as React from "react"

/**
 * The official Telegram Login Widget. It's a script tag that replaces
 * itself with an iframe button once loaded — that only happens if the
 * script element is inserted via the DOM API, not via innerHTML/JSX, so
 * this builds it imperatively in an effect.
 * https://core.telegram.org/widgets/login
 *
 * The iframe's contents belong to Telegram and cannot be styled from here, so
 * the only lever is `data-radius`: 20px against the widget's own 40px-tall
 * large button is a pill, which is the shape every other control in this
 * product uses. Everything else about the button is Telegram's.
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
    script.setAttribute("data-radius", "20")
    script.setAttribute("data-auth-url", authUrl)
    script.setAttribute("data-request-access", "write")
    container.appendChild(script)

    // The widget replaces the script with its own iframe, so emptying the
    // container is what actually removes it. Without this a re-mount stacks a
    // second button under the first.
    return () => {
      container.innerHTML = ""
    }
  }, [botUsername, authUrl])

  return <div ref={containerRef} />
}
