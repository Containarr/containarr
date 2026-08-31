import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react"
import { createPortal } from "react-dom"
import { LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useApi } from "@/hooks/use-api"
import { apiRequest } from "@/lib/api"
import type { PolicyResource } from "@/lib/types"

export function FirewallPolicyDialog({
  onClose,
  onSaved,
  policy,
}: {
  onClose: () => void
  onSaved: (policy: PolicyResource) => void
  policy: PolicyResource | null
}) {
  const [name, setName] = useState(policy?.name ?? "")
  const [allowedIps, setAllowedIps] = useState<string[]>(policy?.allowedIps ?? [])
  const [entry, setEntry] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const suggestions = useApi<string[]>("/api/v1/firewall/suggestions")
  const suggestedIps = (suggestions.status === "success" ? suggestions.data : ["0.0.0.0/0"])
    .filter((ip) => !allowedIps.includes(ip))

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return
      event.stopPropagation()
      if (!submitting) onClose()
    }
    document.addEventListener("keydown", onKeyDown, true)
    return () => document.removeEventListener("keydown", onKeyDown, true)
  }, [onClose, submitting])

  function addEntry() {
    const value = entry.trim()
    if (!value || allowedIps.includes(value)) return
    setAllowedIps([...allowedIps, value])
    setEntry("")
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const submittedIps = entry.trim() && !allowedIps.includes(entry.trim())
        ? [...allowedIps, entry.trim()]
        : allowedIps
      onSaved(await apiRequest<PolicyResource>(
        policy ? `/api/v1/firewall/policy/${policy.id}` : "/api/v1/firewall/policy",
        {
          method: policy ? "PUT" : "POST",
          body: JSON.stringify({ name, allowedIps: submittedIps }),
        }
      ))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Policy could not be saved.")
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose()
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="policy-dialog-title" className="flex max-h-[92vh] min-w-0 w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6">
          <div>
            <h2 id="policy-dialog-title" className="font-semibold">{policy ? "Edit Policy" : "New Policy"}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Allow individual addresses or networks.</p>
          </div>
          <button type="button" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onClose} disabled={submitting} aria-label="Close dialog">
            <X className="size-4" />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.stopPropagation()
            void submit(event)
          }}
          className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 min-w-0 w-full max-w-full flex-1 space-y-5 overflow-x-hidden overflow-y-auto p-5 sm:p-6">
            <div>
              <label htmlFor="policy-name" className="text-sm font-medium">Name</label>
              <Input id="policy-name" required autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Home network" className="mt-1.5" />
            </div>

            <div>
              <label htmlFor="policy-address" className="text-sm font-medium">Allowed IPs</label>
              <div className="mt-1.5 rounded-xl border p-2 focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-ring/30">
                {allowedIps.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {allowedIps.map((ip) => (
                      <span key={ip} title={getIpv4CidrRange(ip)} className="inline-flex items-center gap-1 rounded-md bg-muted py-1 pr-1 pl-2 font-mono text-xs">
                        {ip}
                        <button type="button" aria-label={`Remove ${ip}`} className="flex size-5 items-center justify-center rounded hover:bg-background" onClick={() => setAllowedIps(allowedIps.filter((item) => item !== ip))}>
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    id="policy-address"
                    value={entry}
                    onChange={(event) => setEntry(event.target.value)}
                    onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                      if (event.key === "Enter" || event.key === ",") {
                        event.preventDefault()
                        addEntry()
                      }
                    }}
                    placeholder="192.168.0.0/24"
                    className="h-8 min-w-0 flex-1 bg-transparent px-1 font-mono text-xs outline-none placeholder:text-muted-foreground"
                  />
                  <Button type="button" variant="outline" className="h-8" disabled={!entry.trim()} onClick={addEntry}>Add</Button>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">Press Enter after an IP address or CIDR range.</p>
              {suggestedIps.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-xs text-muted-foreground">Suggestions</span>
                  {suggestedIps.map((ip) => (
                    <button
                      key={ip}
                      type="button"
                      title={getIpv4CidrRange(ip)}
                      className="rounded-md border px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() => setAllowedIps([...allowedIps, ip])}
                    >
                      {ip}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t bg-background px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <LoaderCircle className="mr-2 size-4 animate-spin" />}
              {policy ? "Save" : "Create Policy"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

export function getIpv4CidrRange(value: string) {
  const [address, prefixText, extra] = value.split("/")
  const octets = address.split(".").map(Number)
  const prefix = Number(prefixText)
  if (
    extra !== undefined
    || prefixText === undefined
    || !Number.isInteger(prefix)
    || prefix < 0
    || prefix > 32
    || octets.length !== 4
    || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) return undefined

  const numericAddress = octets.reduce((result, octet) => result * 256 + octet, 0)
  const blockSize = 2 ** (32 - prefix)
  const first = Math.floor(numericAddress / blockSize) * blockSize
  const last = first + blockSize - 1

  return `${[
    Math.floor(first / 16777216),
    Math.floor(first / 65536) % 256,
    Math.floor(first / 256) % 256,
    first % 256,
  ].join(".")} - ${[
    Math.floor(last / 16777216),
    Math.floor(last / 65536) % 256,
    Math.floor(last / 256) % 256,
    last % 256,
  ].join(".")}`
}
