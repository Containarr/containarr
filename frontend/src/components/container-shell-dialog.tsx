import { useEffect, useRef, useState } from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal as XTerm } from "@xterm/xterm"
import { LoaderCircle, Terminal, X } from "lucide-react"

import "@xterm/xterm/css/xterm.css"

export function ContainerShellDialog({
  containerId,
  containerName,
  onClose,
  open,
}: {
  containerId: string
  containerName: string
  onClose: () => void
  open: boolean
}) {
  if (!open) return null

  return (
    <ContainerShellDialogContent
      containerId={containerId}
      containerName={containerName}
      onClose={onClose}
    />
  )
}

function ContainerShellDialogContent({
  containerId,
  containerName,
  onClose,
}: Omit<Parameters<typeof ContainerShellDialog>[0], "open">) {
  const terminalElement = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<"connecting" | "ready" | "closed">(
    "connecting"
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key === "Escape" &&
        !terminalElement.current?.contains(document.activeElement)
      ) {
        onClose()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  useEffect(() => {
    const element = terminalElement.current
    if (!element) return

    const terminal = new XTerm({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      scrollback: 5000,
      theme: {
        background: "#09090b",
        cursor: "#fafafa",
        foreground: "#e4e4e7",
        selectionBackground: "#3f3f46",
      },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(element)

    const shellUrl = new URL(
      `/api/v1/container/${encodeURIComponent(containerId)}/shell`,
      window.location.href
    )
    shellUrl.protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const socket = new WebSocket(shellUrl)
    let disposed = false
    let ready = false
    let ended = false

    function resize() {
      fit.fit()
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "resize",
            columns: terminal.cols,
            rows: terminal.rows,
          })
        )
      }
    }

    const input = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "input", data }))
      }
    })
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(element)

    socket.addEventListener("open", () => {
      if (!disposed) resize()
    })
    socket.addEventListener("message", (message) => {
      if (disposed) return

      try {
        const event = JSON.parse(String(message.data))
        if (event.type === "output") terminal.write(event.data)
        if (event.type === "ready") {
          ready = true
          setError(null)
          setStatus("ready")
          resize()
          terminal.focus()
        }
        if (event.type === "error") setError(event.message)
        if (event.type === "exit") {
          ended = true
          onClose()
        }
      } catch {
        setError("The shell returned an invalid response.")
      }
    })
    socket.addEventListener("error", () => {
      if (disposed || ended) return
      setError(
        ready
          ? "The shell connection was interrupted."
          : "Unable to connect to the container shell."
      )
    })
    socket.addEventListener("close", () => {
      if (!disposed) setStatus("closed")
    })

    return () => {
      disposed = true
      resizeObserver.disconnect()
      input.dispose()
      socket.close()
      terminal.dispose()
    }
  }, [containerId])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="container-shell-title"
        className="flex h-[80vh] max-h-[52rem] min-w-0 w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Terminal className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <h2 id="container-shell-title" className="truncate font-semibold">
                Shell · {containerName}
              </h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                {status === "connecting" && (
                  <LoaderCircle className="size-3 animate-spin" />
                )}
                {status === "connecting"
                  ? "Connecting…"
                  : status === "ready"
                    ? "/bin/sh"
                    : "Session ended"}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close shell"
          >
            <X className="size-4" />
          </button>
        </div>

        {error && (
          <p className="border-b bg-red-50 px-5 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="min-h-0 flex-1 bg-zinc-950 p-3">
          <div ref={terminalElement} className="h-full w-full" />
        </div>
      </div>
    </div>
  )
}
