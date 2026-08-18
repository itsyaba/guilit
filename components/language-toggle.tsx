"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

const LANGUAGES = [
  { value: "am", label: "አማ", name: "Amharic" },
  { value: "en", label: "EN", name: "English" },
] as const

type Language = (typeof LANGUAGES)[number]["value"]

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback)
  return () => window.removeEventListener("storage", callback)
}

function getSnapshot(): Language {
  const stored = window.localStorage.getItem("gulit.lang")
  return stored === "am" || stored === "en" ? stored : "en"
}

function getServerSnapshot(): Language {
  return "en"
}

/**
 * Interface language switch.
 *
 * The control is real and remembers your choice; the translated strings arrive
 * with the i18n ticket, so today it only sets the document language. It is
 * wired now so the header layout is settled before copy starts moving.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const [localLang, setLocalLang] = React.useState<Language | null>(null)
  const storedLang = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const language = localLang ?? storedLang

  React.useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  function choose(next: Language) {
    setLocalLang(next)
    window.localStorage.setItem("gulit.lang", next)
  }


  return (
    <div
      role="group"
      aria-label="Interface language"
      className={cn(
        "inline-flex shrink-0 items-center rounded-lg border border-border p-0.5",
        className
      )}
    >
      {LANGUAGES.map((option) => {
        const active = option.value === language
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => choose(option.value)}
            className={cn(
              "rounded-md px-2 py-1 text-xs leading-none font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span aria-hidden="true">{option.label}</span>
            <span className="sr-only">{option.name}</span>
          </button>
        )
      })}
    </div>
  )
}
