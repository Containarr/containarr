import { useEffect, useId } from "react"
import { LoaderCircle, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"

export function DeleteConfirmDialog({
  deleting,
  description,
  error,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  deleting: boolean
  description: string
  error: string | null
  onCancel: () => void
  onConfirm: () => void
  open: boolean
  title: string
}) {
  if (!open) return null

  return (
    <DeleteConfirmDialogContent
      deleting={deleting}
      description={description}
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
      title={title}
    />
  )
}

function DeleteConfirmDialogContent({
  deleting,
  description,
  error,
  onCancel,
  onConfirm,
  title,
}: Omit<Parameters<typeof DeleteConfirmDialog>[0], "open">) {
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deleting) onCancel()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [deleting, onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !deleting) onCancel()
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
            <h2 id={titleId} className="break-words text-lg font-semibold">
              {title}
            </h2>
            <p
              id={descriptionId}
              className="mt-2 text-sm leading-relaxed text-muted-foreground"
            >
              {description}
            </p>
          </div>
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            onClick={onCancel}
            disabled={deleting}
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </button>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 size-4" />
            )}
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}
