import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react"
import { Globe2, LoaderCircle, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"

import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { MobileHeaderAction } from "@/components/mobile-header-action"
import { PageHeader } from "@/components/page-header"
import { ResourceMenu, type ResourceMenuItem } from "@/components/resource-menu"
import { EmptyState, ErrorState } from "@/components/resource-states"
import { SortableTableHeader, type SortDirection } from "@/components/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ViewToggle } from "@/components/view-toggle"
import { useApi } from "@/hooks/use-api"
import { useStoredViewMode } from "@/hooks/use-stored-view-mode"
import { apiRequest } from "@/lib/api"
import type { AppResource, PolicyResource } from "@/lib/types"

export function FirewallPage() {
  const policies = useApi<Record<string, PolicyResource>>("/api/v1/firewall/policy")
  const apps = useApi<Record<string, AppResource>>("/api/v1/app")
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [dialogPolicy, setDialogPolicy] = useState<PolicyResource | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<PolicyResource | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [view, setView] = useStoredViewMode("containarr-firewall-view")

  useEffect(() => {
    if (searchParams.get("new") === "1") setDialogPolicy(null)

    const policyId = searchParams.get("edit")
    if (policyId && policyId !== "public" && policies.status === "success") {
      const policy = policies.data[policyId]
      if (policy) setDialogPolicy(policy)
    }
  }, [searchParams, policies.status])

  const items = policies.status === "success" ? Object.values(policies.data) : []
  const appUsage = apps.status === "success"
    ? Object.values(apps.data).reduce<Record<string, number>>((counts, app) => {
        counts[app.policyId] = (counts[app.policyId] ?? 0) + 1
        return counts
      }, {})
    : null

  return (
    <section>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Firewall"
          description="Control which networks can access your apps and proxies."
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
          <PolicyCardGrid items={items} appUsage={appUsage} onEdit={setDialogPolicy} onDelete={(policy) => {
            setDeleteError(null)
            setDeleting(policy)
          }} />
        ) : (
          <>
            <div className="sm:hidden">
              <PolicyCardGrid items={items} appUsage={appUsage} onEdit={setDialogPolicy} onDelete={(policy) => {
                setDeleteError(null)
                setDeleting(policy)
              }} />
            </div>
            <PolicyTable items={items} appUsage={appUsage} onEdit={setDialogPolicy} onDelete={(policy) => {
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
            if (searchParams.has("new") || searchParams.has("edit")) {
              navigate("/firewall", { replace: true })
            }
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
        description="Apps and proxies using this policy will be changed to Public. This action cannot be undone."
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
  appUsage,
  items,
  onDelete,
  onEdit,
}: {
  appUsage: Record<string, number> | null
  items: PolicyResource[]
  onDelete: (policy: PolicyResource) => void
  onEdit: (policy: PolicyResource) => void
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((policy) => (
        <ResourceMenu
          key={policy.id}
          triggerLabel={`Actions for ${policy.name}`}
          items={policy.id === "public" ? [{
            label: "Default policy",
            icon: Globe2,
            disabled: true,
            onSelect: () => {},
          }] : [
            {
              label: "Edit",
              icon: Pencil,
              onSelect: () => onEdit(policy),
            },
            {
              label: "Delete",
              icon: Trash2,
              destructive: true,
              onSelect: () => onDelete(policy),
            },
          ] satisfies ResourceMenuItem[]}
        >
        <Card className="overflow-hidden shadow-none">
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
                    ? "Everyone can access apps"
                    : `${policy.allowedIps.length} allowed ${policy.allowedIps.length === 1 ? "source" : "sources"}`}
                  <span aria-hidden="true"> ・ </span>
                  <Link
                    to={`/apps?policy=${encodeURIComponent(policy.id)}`}
                    className="font-medium underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {appUsage
                      ? `Used in ${appUsage[policy.id] ?? 0} ${(appUsage[policy.id] ?? 0) === 1 ? "app" : "apps"}`
                      : "View apps"}
                  </Link>
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
                  <span key={entry} title={getIpv4CidrRange(entry)} className="rounded-md bg-muted px-2 py-1 font-mono text-xs">{entry}</span>
                ))}
                {policy.allowedIps.length === 0 && (
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
        </ResourceMenu>
      ))}
    </div>
  )
}

function PolicyTable({
  appUsage,
  items,
  onDelete,
  onEdit,
}: {
  appUsage: Record<string, number> | null
  items: PolicyResource[]
  onDelete: (policy: PolicyResource) => void
  onEdit: (policy: PolicyResource) => void
}) {
  const [sort, setSort] = useState<{
    key: "name" | "sources" | "allowed" | "apps"
    direction: SortDirection
  } | null>(null)
  const sortedItems = useMemo(() => {
    if (!sort) return items
    return [...items].sort((left, right) => {
      const leftValue = sort.key === "name"
        ? left.name
        : sort.key === "sources"
          ? String(left.id === "public" ? Number.MAX_SAFE_INTEGER : left.allowedIps.length)
          : sort.key === "apps"
            ? String(appUsage?.[left.id] ?? 0)
            : left.allowedIps.join(" ")
      const rightValue = sort.key === "name"
        ? right.name
        : sort.key === "sources"
          ? String(right.id === "public" ? Number.MAX_SAFE_INTEGER : right.allowedIps.length)
          : sort.key === "apps"
            ? String(appUsage?.[right.id] ?? 0)
            : right.allowedIps.join(" ")
      const comparison = leftValue.localeCompare(rightValue, undefined, {
        numeric: true,
        sensitivity: "base",
      })
      return sort.direction === "asc" ? comparison : -comparison
    })
  }, [appUsage, items, sort])

  function changeSort(key: "name" | "sources" | "allowed" | "apps") {
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
            <SortableTableHeader label="Allowed IPs" active={sort?.key === "allowed"} direction={sort?.direction || "asc"} onClick={() => changeSort("allowed")} />
            <SortableTableHeader label="Apps" active={sort?.key === "apps"} direction={sort?.direction || "asc"} onClick={() => changeSort("apps")} />
            <th className="w-12 px-2 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sortedItems.map((policy) => (
            <ResourceMenu
              key={policy.id}
              triggerLabel={`Actions for ${policy.name}`}
              items={policy.id === "public" ? [{
                label: "Default policy",
                icon: Globe2,
                disabled: true,
                onSelect: () => {},
              }] : [
                {
                  label: "Edit",
                  icon: Pencil,
                  onSelect: () => onEdit(policy),
                },
                {
                  label: "Delete",
                  icon: Trash2,
                  destructive: true,
                  onSelect: () => onDelete(policy),
                },
              ] satisfies ResourceMenuItem[]}
            >
            <tr className="hover:bg-muted/25">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3 font-medium">
                  {policy.id === "public" ? <Globe2 className="size-4 text-muted-foreground" /> : <ShieldCheck className="size-4 text-muted-foreground" />}
                  {policy.name}
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {policy.id === "public" ? "Everyone" : policy.allowedIps.length}
              </td>
              <td className="px-4 py-3">
                {policy.id === "public" ? (
                  <span className="text-muted-foreground">All addresses</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {policy.allowedIps.map((entry) => <span key={entry} title={getIpv4CidrRange(entry)} className="rounded-md bg-muted px-2 py-1 font-mono text-xs">{entry}</span>)}
                    {policy.allowedIps.length === 0 && <span className="text-muted-foreground">None</span>}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <Link
                  to={`/apps?policy=${encodeURIComponent(policy.id)}`}
                  className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {appUsage
                    ? `Used in ${appUsage[policy.id] ?? 0} ${(appUsage[policy.id] ?? 0) === 1 ? "app" : "apps"}`
                    : "View apps"}
                </Link>
              </td>
              <td className="w-12 px-2 py-3">
                <ResourceMenu
                  triggerLabel={`Actions for ${policy.name}`}
                  items={policy.id === "public" ? [{
                    label: "Default policy",
                    icon: Globe2,
                    disabled: true,
                    onSelect: () => {},
                  }] : [
                    {
                      label: "Edit",
                      icon: Pencil,
                      onSelect: () => onEdit(policy),
                    },
                    {
                      label: "Delete",
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => onDelete(policy),
                    },
                  ] satisfies ResourceMenuItem[]}
                />
              </td>
            </tr>
            </ResourceMenu>
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
  const [entry, setEntry] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const suggestions = useApi<string[]>("/api/v1/firewall/suggestions")
  const suggestedIps = (suggestions.status === "success" ? suggestions.data : ["0.0.0.0/0"])
    .filter((ip) => !allowedIps.includes(ip))

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
      onSaved(await apiRequest<PolicyResource>(
        policy ? `/api/v1/firewall/policy/${policy.id}` : "/api/v1/firewall/policy",
        {
          method: policy ? "PUT" : "POST",
          body: JSON.stringify({
            name,
            allowedIps: submittedIps,
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
      <div role="dialog" aria-modal="true" aria-labelledby="policy-dialog-title" className="flex max-h-[92vh] min-w-0 w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6">
          <div>
            <h2 id="policy-dialog-title" className="font-semibold">{policy ? "Edit Policy" : "New Policy"}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Allow individual addresses or networks.</p>
          </div>
          <button type="button" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onClose} aria-label="Close dialog">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={(event) => void submit(event)} className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden">
          <div className="min-h-0 min-w-0 w-full max-w-full flex-1 space-y-5 overflow-x-hidden overflow-y-auto p-5 sm:p-6">
            <div>
              <label htmlFor="policy-name" className="text-sm font-medium">Name</label>
              <Input id="policy-name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Home network" className="mt-1.5" />
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
    </div>
  )
}

function getIpv4CidrRange(value: string) {
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
