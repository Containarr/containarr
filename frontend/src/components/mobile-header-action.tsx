import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

export function MobileHeaderAction({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setContainer(document.getElementById("mobile-header-action"))
  }, [])

  return container ? createPortal(children, container) : null
}
