import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Check, ChevronDown, LoaderCircle, Plus, Save, X } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { useApi } from "@/hooks/use-api"
import { apiRequest } from "@/lib/api"
import { TLS_OPTIONS } from "@/lib/tls"
import type { PolicyResource, ProxyResource } from "@/lib/types"

export function ProxyDialog({
  onClose,
  onSaved,
  open,
  proxy = null,
}: {
  onClose: () => void
  onSaved: (proxy: ProxyResource) => void
  open: boolean
  proxy?: ProxyResource | null
}) {
  if (!open) return null
  return (
    <ProxyDialogContent
      onClose={onClose}
      onSaved={onSaved}
      proxy={proxy}
    />
  )
}

function ProxyDialogContent({
  onClose,
  onSaved,
  proxy,
}: {
  onClose: () => void
  onSaved: (proxy: ProxyResource) => void
  proxy: ProxyResource | null
}) {
  const editing = proxy !== null
  const [searchParams] = useSearchParams()
  const domainRequest = useApi<{ domain: string }>("/api/v1/ddns/domain")
  const domain =
    domainRequest.status === "success" ? domainRequest.data.domain : "…"
  const [subdomain, setSubdomain] = useState((proxy?.subdomain ?? "").toLowerCase())
  const [tls, setTls] = useState(proxy?.tls ?? "only_https")
  const [sourceUrl, setSourceUrl] = useState(proxy?.sourceUrl ?? "")
  const [policyId, setPolicyId] = useState(
    searchParams.get("policyId") ?? proxy?.policyId ?? "public"
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const saved = await apiRequest<ProxyResource>(
        editing ? `/api/v1/proxy/${proxy.id}` : "/api/v1/proxy",
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify({ subdomain, tls, sourceUrl, policyId }),
        }
      )
      onSaved(saved)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : `Proxy ${editing ? "update" : "creation"} failed.`
      )
    } finally {
      setSubmitting(false)
    }
  }

  const selectedTlsLabel =
    TLS_OPTIONS.find((option) => option.value === tls)?.label ??
    TLS_OPTIONS[0].label

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="proxy-dialog-title"
        className="flex max-h-[92vh] min-w-0 w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6">
          <div>
            <h2 id="proxy-dialog-title" className="font-semibold">
              {editing ? "Edit Proxy" : "New Proxy"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {editing
                ? "Update the public route or its upstream service."
                : "Expose a service outside Docker on your Containarr domain."}
            </p>
          </div>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </button>
        </div>

        <form
          onSubmit={(event) => void submit(event)}
          className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 min-w-0 w-full max-w-full flex-1 space-y-5 overflow-x-hidden overflow-y-auto p-5 sm:p-6">
            <FormField label="Subdomain">
              <div className="flex min-w-0 max-w-full overflow-hidden">
                <div className="relative shrink-0">
                  <span
                    aria-hidden="true"
                    className="invisible block h-10 w-max whitespace-nowrap pr-11 pl-3 font-mono text-xs"
                  >
                    {selectedTlsLabel}
                  </span>
                  <Select
                    value={tls}
                    onChange={(event) => setTls(event.target.value)}
                    aria-label="TLS mode"
                    className="absolute inset-0 h-10 appearance-none rounded-r-none pr-11 font-mono text-xs text-transparent [&>option]:text-foreground"
                  >
                    {TLS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.menuLabel}
                      </option>
                    ))}
                  </Select>
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-xs">
                    {selectedTlsLabel}
                  </span>
                  <ChevronDown
                    className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex h-10 min-w-0 flex-1 overflow-hidden rounded-r-lg border border-l-0 bg-background shadow-xs focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-ring/30">
                  <Input
                    required
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    value={subdomain}
                    onChange={(event) => setSubdomain(event.target.value.toLowerCase())}
                    placeholder="unifi"
                    className="h-full min-w-0 rounded-none border-0 font-mono text-xs shadow-none focus:ring-0"
                  />
                  <span className="flex min-w-0 max-w-[50%] shrink items-center border-l px-3 font-mono text-xs text-muted-foreground">
                    <span className="truncate">.{domain}</span>
                  </span>
                </div>
              </div>
            </FormField>

            <FormField
              label="Source URL"
              hint="The HTTP or HTTPS address Containarr should forward requests to."
            >
              <Input
                required
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="http://192.168.0.1"
                className="h-10 font-mono text-xs"
              />
            </FormField>
            <PolicyField
              value={policyId}
              onChange={setPolicyId}
              createReturnTo={editing ? `/proxies/${proxy.id}` : "/proxies?new=1"}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <div className="flex shrink-0 justify-end border-t bg-background px-5 py-4 sm:px-6">
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <LoaderCircle className="mr-2 size-4 animate-spin" />
              ) : editing ? (
                <Save className="mr-2 size-4" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PolicyField({
  createReturnTo,
  onChange,
  value,
}: {
  createReturnTo: string
  onChange: (value: string) => void
  value: string
}) {
  const policies = useApi<Record<string, PolicyResource>>("/api/v1/firewall/policy")
  const navigate = useNavigate()
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function closeMenu(event: MouseEvent) {
      if (!menu.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", closeMenu)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("mousedown", closeMenu)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  const selectedPolicy = policies.status === "success" ? policies.data[value] : null

  return (
    <FormField label="Firewall Policy">
      <div ref={menu} className="relative">
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={policies.status !== "success"}
          onClick={() => setOpen(!open)}
          className="flex h-9 w-full cursor-pointer items-center justify-between rounded-lg border bg-background px-3 text-left text-sm shadow-xs outline-none focus:border-foreground/30 focus:ring-2 focus:ring-ring/30 disabled:cursor-default disabled:opacity-50"
        >
          <span>{selectedPolicy?.name ?? "Loading policies…"}</span>
          <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && policies.status === "success" && (
          <div className="absolute right-0 bottom-full left-0 z-30 mb-1 overflow-hidden rounded-lg border bg-card p-1 text-card-foreground shadow-lg">
            <div role="listbox" aria-label="Firewall Policy" className="max-h-52 overflow-y-auto">
              {Object.values(policies.data).map((policy) => (
                <button
                  key={policy.id}
                  type="button"
                  role="option"
                  aria-selected={policy.id === value}
                  onClick={() => {
                    onChange(policy.id)
                    setOpen(false)
                  }}
                  className="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  {policy.name}
                  {policy.id === value && <Check className="size-4" />}
                </button>
              ))}
            </div>
            <div className="mt-1 border-t pt-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  navigate(`/firewall?new=1&returnTo=${encodeURIComponent(createReturnTo)}`)
                }}
                className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                <Plus className="mr-2 size-4" />
                Create new Policy
              </button>
            </div>
          </div>
        )}
      </div>
    </FormField>
  )
}

function FormField({
  children,
  hint,
  label,
}: {
  children: ReactNode
  hint?: string
  label: ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}
