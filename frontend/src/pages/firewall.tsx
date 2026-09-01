import { useEffect, useMemo, useState } from "react"
import { Globe2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"

import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { FirewallPolicyDialog, getIpv4CidrRange } from "@/components/firewall-policy-dialog"
import { MobileHeaderAction } from "@/components/mobile-header-action"
import { PageHeader } from "@/components/page-header"
import { ResourceMenu, type ResourceMenuItem } from "@/components/resource-menu"
import { EmptyState, ErrorState } from "@/components/resource-states"
import { SortableTableHeader, type SortDirection } from "@/components/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  const policyApps = apps.status === "success"
    ? Object.values(apps.data).reduce<Record<string, AppResource[]>>((groupedApps, app) => {
        groupedApps[app.policyId] = [...(groupedApps[app.policyId] ?? []), app]
        return groupedApps
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
          <PolicyCardGrid items={items} policyApps={policyApps} onEdit={setDialogPolicy} onDelete={(policy) => {
            setDeleteError(null)
            setDeleting(policy)
          }} />
        ) : (
          <>
            <div className="sm:hidden">
              <PolicyCardGrid items={items} policyApps={policyApps} onEdit={setDialogPolicy} onDelete={(policy) => {
                setDeleteError(null)
                setDeleting(policy)
              }} />
            </div>
            <PolicyTable items={items} policyApps={policyApps} onEdit={setDialogPolicy} onDelete={(policy) => {
              setDeleteError(null)
              setDeleting(policy)
            }} />
          </>
        )
      )}

      {dialogPolicy !== undefined && (
        <FirewallPolicyDialog
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
  items,
  onDelete,
  onEdit,
  policyApps,
}: {
  items: PolicyResource[]
  onDelete: (policy: PolicyResource) => void
  onEdit: (policy: PolicyResource) => void
  policyApps: Record<string, AppResource[]> | null
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
                  {policyApps ? (
                    policyApps[policy.id]?.length ? (
                      <span className="inline-flex flex-wrap gap-x-2 gap-y-1">
                        {policyApps[policy.id].map((app) => (
                          <Link
                            key={app.id}
                            to={`/apps/${app.id}`}
                            className="font-medium underline-offset-4 hover:text-foreground hover:underline"
                          >
                            {app.name || "Unnamed app"}
                          </Link>
                        ))}
                      </span>
                    ) : "No apps"
                  ) : "Loading apps…"}
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
  items,
  onDelete,
  onEdit,
  policyApps,
}: {
  items: PolicyResource[]
  onDelete: (policy: PolicyResource) => void
  onEdit: (policy: PolicyResource) => void
  policyApps: Record<string, AppResource[]> | null
}) {
  const [sort, setSort] = useState<{
    key: "name" | "allowed" | "apps"
    direction: SortDirection
  }>({ key: "name", direction: "asc" })
  const sortedItems = useMemo(() => {
    return [...items].sort((left, right) => {
      const leftValue = sort.key === "name"
        ? left.name
        : sort.key === "apps"
          ? (policyApps?.[left.id] ?? []).map((app) => app.name || "").join(" ")
          : left.allowedIps.join(" ")
      const rightValue = sort.key === "name"
        ? right.name
        : sort.key === "apps"
          ? (policyApps?.[right.id] ?? []).map((app) => app.name || "").join(" ")
          : right.allowedIps.join(" ")
      const comparison = leftValue.localeCompare(rightValue, undefined, {
        numeric: true,
        sensitivity: "base",
      })
      return sort.direction === "asc" ? comparison : -comparison
    })
  }, [items, policyApps, sort])

  function changeSort(key: "name" | "allowed" | "apps") {
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
              <td className="px-4 py-3">
                {policy.id === "public" ? (
                  <span className="text-muted-foreground">Everyone</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {policy.allowedIps.map((entry) => <span key={entry} title={getIpv4CidrRange(entry)} className="rounded-md bg-muted px-2 py-1 font-mono text-xs">{entry}</span>)}
                    {policy.allowedIps.length === 0 && <span className="text-muted-foreground">None</span>}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                {policyApps ? (
                  policyApps[policy.id]?.length ? (
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {policyApps[policy.id].map((app) => (
                        <Link
                          key={app.id}
                          to={`/apps/${app.id}`}
                          className="font-medium hover:underline"
                        >
                          {app.name || "Unnamed app"}
                        </Link>
                      ))}
                    </div>
                  ) : <span className="text-muted-foreground">None</span>
                ) : <span className="text-muted-foreground">Loading…</span>}
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
