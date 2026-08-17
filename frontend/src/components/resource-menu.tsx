import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from "react"
import { createPortal } from "react-dom"
import { CircleAlert, MoreHorizontal, type LucideIcon } from "lucide-react"

export type ResourceMenuItem = {
  label: string
  icon: LucideIcon
  onSelect: () => void | Promise<void>
  destructive?: boolean
  disabled?: boolean
}

export function ResourceMenu({
  children,
  items,
  triggerLabel = "Open actions menu",
}: {
  children?: ReactElement
  items: ResourceMenuItem[]
  triggerLabel?: string
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!error) return
    const timeout = window.setTimeout(() => setError(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [error])

  useEffect(() => {
    if (!position) return

    function close() {
      setPosition(null)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") close()
    }

    window.addEventListener("blur", close)
    window.addEventListener("resize", close)
    window.addEventListener("scroll", close, true)
    window.addEventListener("keydown", closeOnEscape)
    document.addEventListener("mousedown", close)
    return () => {
      window.removeEventListener("blur", close)
      window.removeEventListener("resize", close)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("keydown", closeOnEscape)
      document.removeEventListener("mousedown", close)
    }
  }, [position])

  function openAt(left: number, top: number) {
    const width = 208
    const height = items.length * 40 + 8
    setPosition({
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(top, window.innerHeight - height - 8)),
    })
  }

  const card = children && isValidElement(children)
    ? cloneElement(children, {
        onContextMenu: (event: ReactMouseEvent) => {
          event.preventDefault()
          event.stopPropagation()
          openAt(event.clientX, event.clientY)
        },
      } as object)
    : null

  return (
    <>
      {card}
      {!children && (
        <button
          ref={trigger}
          type="button"
          aria-label={triggerLabel}
          aria-haspopup="menu"
          aria-expanded={position !== null}
          onClick={(event) => {
            event.stopPropagation()
            if (position) {
              setPosition(null)
              return
            }
            const bounds = trigger.current?.getBoundingClientRect()
            if (bounds) openAt(bounds.right - 208, bounds.bottom + 4)
          }}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreHorizontal className="size-4" />
        </button>
      )}
      {position && createPortal(
        <div
          role="menu"
          onMouseDown={(event) => event.stopPropagation()}
          className="fixed z-[100] w-52 rounded-lg border bg-card p-1 text-card-foreground shadow-xl"
          style={position}
        >
          {items.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setPosition(null)
                  void Promise.resolve(item.onSelect()).catch((actionError) => {
                    setError(actionError instanceof Error ? actionError.message : "Action failed.")
                  })
                }}
                className={`flex h-10 w-full items-center rounded-md px-3 text-left text-sm disabled:cursor-default disabled:opacity-50 ${
                  item.destructive
                    ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                    : "hover:bg-muted"
                }`}
              >
                <Icon className="mr-2.5 size-4" />
                {item.label}
              </button>
            )
          })}
        </div>,
        document.body
      )}
      {error && createPortal(
        <div
          role="alert"
          className="fixed right-4 bottom-4 z-[110] flex max-w-sm items-start gap-2 rounded-lg border border-red-500/30 bg-card px-4 py-3 text-sm text-red-700 shadow-xl dark:text-red-300"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>,
        document.body
      )}
    </>
  )
}
