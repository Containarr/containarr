import { useEffect, useId } from "react"
import { Eraser, LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"

export function CleanupConfirmDialog({
  description,
  error,
  onCancel,
  onConfirm,
  open,
  pending,
  resource,
}: {
  description: string
  error: string | null
  onCancel: () => void
  onConfirm: () => void
  open: boolean
  pending: boolean
  resource: string
}) {
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onCancel()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onCancel, open, pending])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="min-w-0 w-full max-w-md rounded-2xl border bg-background p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold">
              Cleanup {resource}?
            </h2>
            <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            disabled={pending}
            onClick={onCancel}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" />
            ) : (
              <Eraser className="mr-2 size-4" />
            )}
            Cleanup
          </Button>
        </div>
      </div>
    </div>
  )
}
