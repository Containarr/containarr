import { useEffect, useState, type FormEvent } from "react"
import { createPortal } from "react-dom"
import { LoaderCircle, Network, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiRequest } from "@/lib/api"
import type { DockerNetworkResource } from "@/lib/types"

export function NewNetworkDialog({
  onClose,
  onCreated,
  open,
}: {
  onClose: () => void
  onCreated: (network: DockerNetworkResource) => void
  open: boolean
}) {
  const [name, setName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName("")
    setSubmitting(false)
    setError(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      event.stopPropagation()
      if (!submitting) onClose()
    }
    document.addEventListener("keydown", closeOnEscape, true)
    return () => document.removeEventListener("keydown", closeOnEscape, true)
  }, [onClose, open, submitting])

  if (!open) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      onCreated(await apiRequest<DockerNetworkResource>("/api/v1/network", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      }))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Network could not be created.")
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose()
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="new-network-title" className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6">
          <div>
            <h2 id="new-network-title" className="font-semibold">New Network</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Create a Docker bridge network.</p>
          </div>
          <button type="button" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onClose} disabled={submitting} aria-label="Close dialog">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={(event) => {
          event.stopPropagation()
          void submit(event)
        }}>
          <fieldset disabled={submitting} className="space-y-5 p-5 sm:p-6">
            <div>
              <label htmlFor="network-name" className="text-sm font-medium">Name</label>
              <Input id="network-name" required autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="my_network_1" className="mt-1.5" />
            </div>
            <div>
              <span className="text-sm font-medium">Driver</span>
              <div className="mt-1.5 flex h-9 items-center gap-2 rounded-lg border bg-muted/30 px-3 text-sm text-muted-foreground" aria-label="Driver: Bridge">
                <Network className="size-4" />
                Bridge
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">The network driver cannot be changed.</p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </fieldset>
          <div className="flex justify-end border-t px-5 py-4 sm:px-6">
            <Button type="submit" disabled={!name.trim()}>
              {submitting ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Network className="mr-2 size-4" />}
              {submitting ? "Creating…" : "Create Network"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
