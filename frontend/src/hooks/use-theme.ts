import { useEffect, useState } from "react"

export type Theme = "light" | "system" | "dark"

const STORAGE_KEY = "containarr-theme"

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(STORAGE_KEY)
    } catch {
      // Storage can be unavailable in hardened/private browser contexts.
    }
    return stored === "light" || stored === "dark" ? stored : "system"
  })

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")

    function apply() {
      const dark = theme === "dark" || (theme === "system" && media.matches)
      document.documentElement.classList.toggle("dark", dark)
      document.documentElement.style.colorScheme = dark ? "dark" : "light"
    }

    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [theme])

  function setTheme(value: Theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Keep the in-memory preference even when persistence is unavailable.
    }
    setThemeState(value)
  }

  return [theme, setTheme] as const
}
