import { useState } from "react"

import type { ViewMode } from "@/lib/types"

export function useStoredViewMode(key: string) {
  const [view, setViewState] = useState<ViewMode>(() => {
    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(key)
    } catch {
      // Storage can be unavailable in hardened/private browser contexts.
    }
    return stored === "table" ? "table" : "cards"
  })

  function setView(value: ViewMode) {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // Keep the in-memory preference even when persistence is unavailable.
    }
    setViewState(value)
  }

  return [view, setView] as const
}
