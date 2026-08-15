import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react"
import { Globe2, LoaderCircle, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { MobileHeaderAction } from "@/components/mobile-header-action"
import { PageHeader } from "@/components/page-header"
import { EmptyState, ErrorState } from "@/components/resource-states"
import { SortableTableHeader, type SortDirection } from "@/components/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ViewToggle } from "@/components/view-toggle"
import { useApi } from "@/hooks/use-api"
import { useStoredViewMode } from "@/hooks/use-stored-view-mode"
import { apiRequest } from "@/lib/api"
import type { PolicyResource, TailscaleDevice, TailscaleSettings } from "@/lib/types"

export function FirewallPage() {
  const policies = useApi<Record<string, PolicyResource>>("/api/v1/firewall/policy")
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [dialogPolicy, setDialogPolicy] = useState<PolicyResource | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<PolicyResource | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [view, setView] = useStoredViewMode("containarr-firewall-view")

  useEffect(() => {
    if (searchParams.get("new") === "1") setDialogPolicy(null)
  }, [searchParams])

  const items = policies.status === "success" ? Object.values(policies.data) : []

  return (
    <section>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Firewall"
          description="Control which networks and Tailscale devices can access your apps."
        />
        <div className="flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <Button type="button" onClick={() => setDialogPolicy(null)} className="hidden md:inline-flex">
            <Plus className="mr-1.5 size-4" />
            Policy
          </Button>
        </div>
      </div>

      <MobileHeaderAction>
        <Button type="button" className="h-9" onClick={() => setDialogPolicy(null)}>
          <Plus className="mr-1.5 size-4" />
          Policy
        </Button>
      </MobileHeaderAction>

      {policies.status === "loading" && (
        <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => <Skeleton key={item} className="h-52 rounded-xl" />)}
        </div>
      )}
      {policies.status === "error" && (
        <ErrorState message={policies.error} onRetry={policies.reload} />
      )}
      {policies.status === "success" && items.length === 0 && (
        <EmptyState>No firewall policies configured.</EmptyState>
      )}
      {policies.status === "success" && items.length > 0 && (
        view === "cards" ? (
          <PolicyCardGrid items={items} onEdit={setDialogPolicy} onDelete={(policy) => {
            setDeleteError(null)
            setDeleting(policy)
          }} />
        ) : (
          <>
            <div className="sm:hidden">
              <PolicyCardGrid items={items} onEdit={setDialogPolicy} onDelete={(policy) => {
                setDeleteError(null)
                setDeleting(policy)
              }} />
            </div>
            <PolicyTable items={items} onEdit={setDialogPolicy} onDelete={(policy) => {
              setDeleteError(null)
              setDeleting(policy)
            }} />
          </>
        )
      )}

      {dialogPolicy !== undefined && (
        <PolicyDialog
          policy={dialogPolicy}
          onClose={() => {
            setDialogPolicy(undefined)
            if (searchParams.get("new") === "1") navigate("/firewall", { replace: true })
          }}
          onSaved={(policy) => {
            setDialogPolicy(undefined)
            policies.reload()
            const returnTo = searchParams.get("returnTo")
            if (returnTo) {
              navigate(`${returnTo}${returnTo.includes("?") ? "&" : "?"}policyId=${encodeURIComponent(policy.id)}`)
            } else {
              navigate("/firewall", { replace: true })
            }
          }}
        />
      )}

      <DeleteConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name || "policy"}?`}
        description="Apps using this policy will be changed to Public. This action cannot be undone."
        deleting={deletePending}
        error={deleteError}
        onCancel={() => {
          setDeleting(null)
          setDeleteError(null)
        }}
        onConfirm={() => {
          if (!deleting) return
          setDeletePending(true)
          setDeleteError(null)
          void apiRequest(`/api/v1/firewall/policy/${deleting.id}`, { method: "DELETE" })
            .then(() => {
              setDeleting(null)
              policies.reload()
            })
            .catch((error) => setDeleteError(error instanceof Error ? error.message : "Delete failed."))
            .finally(() => setDeletePending(false))
        }}
      />
    </section>
  )
}

function PolicyCardGrid({
  items,
  onDelete,
  onEdit,
}: {
  items: PolicyResource[]
  onDelete: (policy: PolicyResource) => void
  onEdit: (policy: PolicyResource) => void
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((policy) => (
        <Card key={policy.id} className="overflow-hidden shadow-none">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
                {policy.id === "public" ? (
                  <Globe2 className="size-5 text-muted-foreground" />
                ) : (
                  <ShieldCheck className="size-5 text-muted-foreground" />
                )}
              </span>
              <div className="min-w-0">
                <CardTitle className="truncate text-base">{policy.name}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {policy.id === "public"
                    ? "Everyone can access apps with this policy."
                    : `${policy.allowedIps.length + (policy.tailscaleDevices?.length ?? 0)} allowed ${policy.allowedIps.length + (policy.tailscaleDevices?.length ?? 0) === 1 ? "source" : "sources"}`}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4 pt-4">
            {policy.id === "public" ? (
              <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Default policy · cannot be deleted
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {policy.allowedIps.map((entry) => (
                  <span key={entry} className="rounded-md bg-muted px-2 py-1 font-mono text-xs">{entry}</span>
                ))}
                {(policy.tailscaleDevices ?? []).map((device) => (
                  <span key={device.id} title={device.address} className="rounded-md bg-muted px-2 py-1 text-xs">
                    {device.name}
                  </span>
                ))}
                {policy.allowedIps.length === 0 && (policy.tailscaleDevices?.length ?? 0) === 0 && (
                  <p className="text-xs text-muted-foreground">No addresses are allowed.</p>
                )}
              </div>
            )}
            {policy.id !== "public" && (
              <div className="mt-auto flex gap-2 border-t pt-4">
                <Button type="button" variant="outline" className="h-8 flex-1" onClick={() => onEdit(policy)}>
                  <Pencil className="mr-1.5 size-3.5" />
                  Edit
                </Button>
                <Button type="button" variant="outline" className="h-8 flex-1 text-red-600 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400" onClick={() => onDelete(policy)}>
                  <Trash2 className="mr-1.5 size-3.5" />
                  Delete
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function PolicyTable({
  items,
  onDelete,
  onEdit,
}: {
  items: PolicyResource[]
  onDelete: (policy: PolicyResource) => void
  onEdit: (policy: PolicyResource) => void
}) {
  const [sort, setSort] = useState<{
    key: "name" | "sources" | "allowed"
    direction: SortDirection
  } | null>(null)
  const sortedItems = useMemo(() => {
    if (!sort) return items
    return [...items].sort((left, right) => {
      const leftValue = sort.key === "name"
        ? left.name
        : sort.key === "sources"
          ? String(left.id === "public" ? Number.MAX_SAFE_INTEGER : left.allowedIps.length + (left.tailscaleDevices?.length ?? 0))
          : [...left.allowedIps, ...(left.tailscaleDevices ?? []).map((device) => device.name)].join(" ")
      const rightValue = sort.key === "name"
        ? right.name
        : sort.key === "sources"
          ? String(right.id === "public" ? Number.MAX_SAFE_INTEGER : right.allowedIps.length + (right.tailscaleDevices?.length ?? 0))
          : [...right.allowedIps, ...(right.tailscaleDevices ?? []).map((device) => device.name)].join(" ")
      const comparison = leftValue.localeCompare(rightValue, undefined, {
        numeric: true,
        sensitivity: "base",
      })
      return sort.direction === "asc" ? comparison : -comparison
    })
  }, [items, sort])

  function changeSort(key: "name" | "sources" | "allowed") {
    setSort((current) => ({
      key,
      direction: current?.key === key && current.direction === "asc" ? "desc" : "asc",
    }))
  }

  return (
    <div className="hidden overflow-hidden rounded-xl border bg-card shadow-xs sm:block">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <SortableTableHeader label="Policy" active={sort?.key === "name"} direction={sort?.direction || "asc"} onClick={() => changeSort("name")} />
            <SortableTableHeader label="Sources" active={sort?.key === "sources"} direction={sort?.direction || "asc"} onClick={() => changeSort("sources")} />
            <SortableTableHeader label="Allowed IPs and Devices" active={sort?.key === "allowed"} direction={sort?.direction || "asc"} onClick={() => changeSort("allowed")} />
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sortedItems.map((policy) => (
            <tr key={policy.id} className="hover:bg-muted/25">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3 font-medium">
                  {policy.id === "public" ? <Globe2 className="size-4 text-muted-foreground" /> : <ShieldCheck className="size-4 text-muted-foreground" />}
                  {policy.name}
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {policy.id === "public" ? "Everyone" : policy.allowedIps.length + (policy.tailscaleDevices?.length ?? 0)}
              </td>
              <td className="px-4 py-3">
                {policy.id === "public" ? (
                  <span className="text-muted-foreground">All addresses</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {policy.allowedIps.map((entry) => <span key={entry} className="rounded-md bg-muted px-2 py-1 font-mono text-xs">{entry}</span>)}
                    {(policy.tailscaleDevices ?? []).map((device) => <span key={device.id} title={device.address} className="rounded-md bg-muted px-2 py-1 text-xs">{device.name}</span>)}
                    {policy.allowedIps.length === 0 && (policy.tailscaleDevices?.length ?? 0) === 0 && <span className="text-muted-foreground">None</span>}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                {policy.id === "public" ? (
                  <p className="text-right text-xs text-muted-foreground">Default</p>
                ) : (
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" className="h-8" onClick={() => onEdit(policy)}><Pencil className="mr-1.5 size-3.5" />Edit</Button>
                    <Button type="button" variant="outline" className="h-8 text-red-600 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400" onClick={() => onDelete(policy)}><Trash2 className="mr-1.5 size-3.5" />Delete</Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PolicyDialog({
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
  const [tailscaleDevices, setTailscaleDevices] = useState(
    policy?.tailscaleDevices ?? []
  )
  const [availableTailscaleDevices, setAvailableTailscaleDevices] = useState<
    Array<{ id: string; name: string; address: string }>
  >([])
  const [entry, setEntry] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
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
      const detectedDevices = availableTailscaleDevices.filter((device) =>
        submittedIps.includes(device.address)
      )
      const submittedDevices = [
        ...tailscaleDevices,
        ...detectedDevices.filter((device) =>
          !tailscaleDevices.some((selected) => selected.id === device.id)
        ),
      ]
      onSaved(await apiRequest<PolicyResource>(
        policy ? `/api/v1/firewall/policy/${policy.id}` : "/api/v1/firewall/policy",
        {
          method: policy ? "PUT" : "POST",
          body: JSON.stringify({
            name,
            allowedIps: submittedIps.filter((ip) =>
              !submittedDevices.some((device) => device.address === ip)
            ),
            tailscaleDevices: submittedDevices,
          }),
        }
      ))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Policy could not be saved.")
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose()
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="policy-dialog-title" className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6">
          <div>
            <h2 id="policy-dialog-title" className="font-semibold">{policy ? "Edit Policy" : "New Policy"}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Allow individual addresses, networks, or Tailscale devices.</p>
          </div>
          <button type="button" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onClose} aria-label="Close dialog">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
            <div>
              <label htmlFor="policy-name" className="text-sm font-medium">Name</label>
              <Input id="policy-name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Home network" className="mt-1.5" />
            </div>

            <div>
              <label htmlFor="policy-address" className="text-sm font-medium">Allowed IPs</label>
              <div className="mt-1.5 rounded-xl border p-2 focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-ring/30">
                {allowedIps.length + tailscaleDevices.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {allowedIps.map((ip) => {
                      const device = availableTailscaleDevices.find((item) => item.address === ip)
                      return (
                      <span key={ip} title={device ? ip : undefined} className={`inline-flex items-center gap-1 rounded-md bg-muted py-1 pr-1 pl-2 text-xs ${device ? "" : "font-mono"}`}>
                        {device?.name ?? ip}
                        <button type="button" aria-label={`Remove ${ip}`} className="flex size-5 items-center justify-center rounded hover:bg-background" onClick={() => setAllowedIps(allowedIps.filter((item) => item !== ip))}>
                          <X className="size-3" />
                        </button>
                      </span>
                      )
                    })}
                    {tailscaleDevices.map((device) => (
                      <span key={device.id} title={device.address} className="inline-flex items-center gap-1 rounded-md bg-muted py-1 pr-1 pl-2 text-xs">
                        {device.name}
                        <button type="button" aria-label={`Remove ${device.name}`} className="flex size-5 items-center justify-center rounded hover:bg-background" onClick={() => setTailscaleDevices(tailscaleDevices.filter((item) => item.id !== device.id))}>
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
            </div>

            <TailscaleDevicePicker
              onDevicesLoaded={setAvailableTailscaleDevices}
              onSelect={(device) => {
                setAllowedIps(allowedIps.filter((ip) => ip !== device.address))
                setTailscaleDevices([
                  ...tailscaleDevices.filter((item) => item.id !== device.id),
                  device,
                ])
              }}
            />

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
    </div>
  )
}

function TailscaleDevicePicker({
  onDevicesLoaded,
  onSelect,
}: {
  onDevicesLoaded: (devices: Array<{ id: string; name: string; address: string }>) => void
  onSelect: (device: { id: string; name: string; address: string }) => void
}) {
  const settings = useApi<TailscaleSettings>("/api/v1/tailscale")

  if (settings.status !== "success" || !settings.data.clientSecretConfigured) {
    return (
      <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Configure Tailscale under Settings to select devices.
      </p>
    )
  }

  return <ConfiguredTailscaleDevicePicker onDevicesLoaded={onDevicesLoaded} onSelect={onSelect} />
}

function ConfiguredTailscaleDevicePicker({
  onDevicesLoaded,
  onSelect,
}: {
  onDevicesLoaded: (devices: Array<{ id: string; name: string; address: string }>) => void
  onSelect: (device: { id: string; name: string; address: string }) => void
}) {
  const devices = useApi<TailscaleDevice[]>("/api/v1/tailscale/devices")

  useEffect(() => {
    if (devices.status !== "success") return
    onDevicesLoaded(devices.data.flatMap((device) => {
      const address = device.addresses.find((item) => item.includes("."))
      if (!address) return []
      return [{
        id: device.id,
        name: (device.hostname || device.name).split(".")[0],
        address,
      }]
    }))
  }, [devices.status, devices.status === "success" ? devices.data : null, onDevicesLoaded])

  if (devices.status === "loading") {
    return <Skeleton className="h-9 w-full rounded-lg" />
  }
  if (devices.status === "error") {
    return <p className="text-xs text-red-600 dark:text-red-400">{devices.error}</p>
  }

  return (
    <div>
      <label htmlFor="tailscale-device" className="text-sm font-medium">Tailscale device</label>
      <Select
        id="tailscale-device"
        value=""
        className="mt-1.5"
        onChange={(event) => {
          const device = devices.data.find((item) => item.id === event.target.value)
          const address = device?.addresses.find((item) => item.includes("."))
          if (device && address) onSelect({
            id: device.id,
            name: (device.hostname || device.name).split(".")[0],
            address,
          })
        }}
      >
        <option value="">Select a device…</option>
        {devices.data.map((device) => {
          const address = device.addresses.find((item) => item.includes("."))
          if (!address) return null
          return <option key={device.id} value={device.id}>{(device.hostname || device.name).split(".")[0]} · {address}</option>
        })}
      </Select>
    </div>
  )
}
