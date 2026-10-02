import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"

export function Tooltip({ children, contentClassName, text, tabIndex }: { children: ReactNode; contentClassName?: string; text?: string; tabIndex?: number }) {
  const id = useId()
  const trigger = useRef<HTMLSpanElement>(null)
  const content = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })

  useLayoutEffect(() => {
    if (!open || !text || !trigger.current || !content.current) return
    const bounds = trigger.current.getBoundingClientRect()
    const tooltip = content.current.getBoundingClientRect()
    setPosition({
      left: Math.max(8, Math.min(bounds.left + (bounds.width - tooltip.width) / 2, window.innerWidth - tooltip.width - 8)),
      top: Math.max(8, Math.min(bounds.top >= tooltip.height + 16 ? bounds.top - tooltip.height - 8 : bounds.bottom + 8, window.innerHeight - tooltip.height - 8)),
    })

    function dismiss() { setOpen(false) }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopImmediatePropagation()
        setOpen(false)
      }
    }
    window.addEventListener("scroll", dismiss, true)
    window.addEventListener("resize", dismiss)
    window.addEventListener("keydown", onKeyDown, true)
    return () => {
      window.removeEventListener("scroll", dismiss, true)
      window.removeEventListener("resize", dismiss)
      window.removeEventListener("keydown", onKeyDown, true)
    }
  }, [open, text])

  return (
    <span
      ref={trigger}
      className="inline-flex"
      tabIndex={text ? tabIndex : undefined}
      aria-describedby={open && text ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) setOpen(false)
      }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      {children}
      {open && text && createPortal(
        <span
          ref={content}
          id={id}
          role="tooltip"
          className={cn(
            "pointer-events-none fixed z-[100] max-w-[calc(100vw-1rem)] rounded-md bg-foreground px-2 py-1 font-mono text-xs text-background shadow-md",
            contentClassName
          )}
          style={position}
        >
          {text}
        </span>,
        document.body
      )}
    </span>
  )
}
