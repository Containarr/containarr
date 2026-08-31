import { useMemo, useState } from "react"
import { ArrowUpRight, Boxes, CalendarDays, Eraser, Fingerprint, Globe2, Network, Plus, Settings2, Trash2 } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { CleanupConfirmDialog } from "@/components/cleanup-confirm-dialog"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { MobileHeaderAction } from "@/components/mobile-header-action"
import { NewNetworkDialog } from "@/components/new-network-dialog"
import { PageHeader } from "@/components/page-header"
import { ResourceMenu, type ResourceMenuItem } from "@/components/resource-menu"
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/resource-states"
import { SortableTableHeader, type SortDirection } from "@/components/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ViewToggle } from "@/components/view-toggle"
import { useApi } from "@/hooks/use-api"
import { useStoredViewMode } from "@/hooks/use-stored-view-mode"
import { apiRequest } from "@/lib/api"
import type { DockerCleanupResult, DockerNetworkResource } from "@/lib/types"

export function NetworksPage() {
  const navigate = useNavigate()
  const networks = useApi<DockerNetworkResource[]>("/api/v1/network", { pollInterval: 5000 })
  const [view, setView] = useStoredViewMode("containarr-networks-view")
  const [confirmingCleanup, setConfirmingCleanup] = useState(false)
  const [creatingNetwork, setCreatingNetwork] = useState(false)
  const [cleanupPending, setCleanupPending] = useState(false)
  const [cleanupError, setCleanupError] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: NetworkSortKey; direction: SortDirection } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const items = networks.status === "success" ? networks.data : []
  const sortedItems = useMemo(() => {
    if (!sort) return items
    return [...items].sort((left, right) => {
      const leftValue = sort.key === "network" ? left.name
        : sort.key === "driver" ? left.driver
          : sort.key === "scope" ? left.scope
            : sort.key === "subnet" ? left.subnets.join(", ")
              : sort.key === "containers" ? left.containers.map((container) => container.name).join(", ")
                : left.created
      const rightValue = sort.key === "network" ? right.name
        : sort.key === "driver" ? right.driver
          : sort.key === "scope" ? right.scope
            : sort.key === "subnet" ? right.subnets.join(", ")
              : sort.key === "containers" ? right.containers.map((container) => container.name).join(", ")
                : right.created
      const comparison = String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" })
      return sort.direction === "asc" ? comparison : -comparison
    })
  }, [items, sort])
  const selectableItems = sortedItems.filter((network) => network.deletable)
  const allSelected = selectableItems.length > 0 && selectableItems.every((network) => selected.has(network.id))
  const someSelected = selectableItems.some((network) => selected.has(network.id))

  function changeSort(key: NetworkSortKey) {
    setSort((current) => ({
      key,
      direction: current?.key === key && current.direction === "asc" ? "desc" : "asc",
    }))
  }

  return (
    <section>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <PageHeader title="Networks" description="Docker networks and their connected containers." />
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" className="hidden md:inline-flex" onClick={() => setConfirmingCleanup(true)}>
            <Eraser className="mr-2 size-4" />
            Cleanup
          </Button>
          <ViewToggle value={view} onChange={setView} />
          <Button type="button" onClick={() => setCreatingNetwork(true)} className="hidden md:inline-flex">
            <Plus className="mr-1.5 size-4" />
            Network
          </Button>
        </div>
      </div>

      <MobileHeaderAction>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" className="h-9" onClick={() => setConfirmingCleanup(true)}>
            <Eraser className="mr-1.5 size-4" />
            Cleanup
          </Button>
          <Button type="button" className="h-9" onClick={() => setCreatingNetwork(true)}>
            <Plus className="mr-1.5 size-4" />
            Network
          </Button>
        </div>
      </MobileHeaderAction>

      {networks.status === "loading" && <CardGridSkeleton />}
      {networks.status === "error" && <ErrorState message={networks.error} onRetry={networks.reload} />}
      {networks.status === "success" && items.length === 0 && <EmptyState>No networks were found on this host.</EmptyState>}
      {networks.status === "success" && items.length > 0 && (
        <>
          <div className={view === "cards" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "grid gap-4 sm:hidden"}>
            {items.map((network) => {
              const menuItems: ResourceMenuItem[] = [
                ...network.containers.map((container) => ({
                  label: `Open ${container.name}`,
                  icon: ArrowUpRight,
                  onSelect: () => navigate(`/containers/${container.id}`),
                })),
                {
                  label: "Delete",
                  icon: Trash2,
                  destructive: true,
                  disabled: !network.deletable,
                  onSelect: () => {
                    setSelected(new Set([network.id]))
                    setConfirmingDelete(true)
                  },
                },
              ]
              return (
              <ResourceMenu key={network.id} items={menuItems} triggerLabel={`Actions for ${network.name}`}>
              <Card className="gap-5 p-5 shadow-none">
                <CardHeader className="flex flex-row items-center gap-3 p-0">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-700 dark:text-cyan-400">
                    <Network className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{network.name}</CardTitle>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {[network.driver, network.internal ? "internal" : null, network.ingress ? "ingress" : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2.5 p-0">
                  <NetworkDataRow icon={Fingerprint} label="ID" value={network.id.slice(0, 12)} mono />
                  <div className="flex min-w-0 items-start gap-2 text-sm">
                    <Boxes className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="shrink-0 text-muted-foreground">Containers</span>
                    {network.containers.length > 0 ? (
                      <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-x-2 gap-y-1 text-xs">
                        {network.containers.map((container) => (
                          <Link
                            key={container.id}
                            to={`/containers/${container.id}`}
                            className="max-w-40 truncate font-medium hover:underline"
                          >
                            {container.name}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <span className="ml-auto text-xs font-medium text-muted-foreground">None</span>
                    )}
                  </div>
                  <NetworkDataRow icon={Globe2} label="Subnet" value={network.subnets.join(", ") || "None"} mono />
                  <NetworkDataRow icon={Settings2} label="Scope" value={network.scope} />
                  <NetworkDataRow icon={CalendarDays} label="Created" value={new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(network.created))} />
                </CardContent>
              </Card>
              </ResourceMenu>
              )
            })}
          </div>

          {view === "table" && (
            <div className="hidden sm:block">
              {selected.size > 0 && (
                <div className="mb-3 flex items-center justify-between rounded-lg border bg-card px-3 py-2 shadow-xs">
                  <span className="text-sm text-muted-foreground">{selected.size} selected</span>
                  <Button type="button" variant="destructive" onClick={() => setConfirmingDelete(true)}>
                    <Trash2 className="mr-2 size-4" />
                    Delete
                  </Button>
                </div>
              )}
              <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="w-12 px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label="Select all unused networks"
                          checked={allSelected}
                          disabled={selectableItems.length === 0}
                          ref={(input) => { if (input) input.indeterminate = someSelected && !allSelected }}
                          onChange={() => setSelected(allSelected ? new Set() : new Set(selectableItems.map((network) => network.id)))}
                          className="size-4 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </th>
                      {(["network", "driver", "scope", "subnet", "containers", "created"] as const).map((key) => (
                        <SortableTableHeader
                          key={key}
                          label={key.charAt(0).toUpperCase() + key.slice(1)}
                          active={sort?.key === key}
                          direction={sort?.direction || "asc"}
                          onClick={() => changeSort(key)}
                        />
                      ))}
                      <th className="w-12 px-2 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sortedItems.map((network) => {
                      const menuItems: ResourceMenuItem[] = [
                        ...network.containers.map((container) => ({
                          label: `Open ${container.name}`,
                          icon: ArrowUpRight,
                          onSelect: () => navigate(`/containers/${container.id}`),
                        })),
                        {
                          label: "Delete",
                          icon: Trash2,
                          destructive: true,
                          disabled: !network.deletable,
                          onSelect: () => {
                            setSelected(new Set([network.id]))
                            setConfirmingDelete(true)
                          },
                        },
                      ]
                      return (
                      <ResourceMenu key={network.id} items={menuItems} triggerLabel={`Actions for ${network.name}`}>
                      <tr className="hover:bg-muted/25">
                        <td className="w-12 px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${network.name}`}
                            checked={selected.has(network.id)}
                            disabled={!network.deletable}
                            title={!network.deletable
                              ? network.containers.length > 0
                                ? "Networks used by containers cannot be deleted."
                                : "Docker system networks cannot be deleted."
                              : undefined}
                            onChange={() => setSelected((current) => {
                              const next = new Set(current)
                              if (next.has(network.id)) next.delete(network.id)
                              else next.add(network.id)
                              return next
                            })}
                            className="size-4 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{network.name}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{network.id.slice(0, 12)}</p>
                        </td>
                        <td className="px-4 py-3">{network.driver}</td>
                        <td className="px-4 py-3">{network.scope}</td>
                        <td className="max-w-64 truncate px-4 py-3 font-mono text-xs">{network.subnets.join(", ") || "None"}</td>
                        <td className="px-4 py-3">
                          {network.containers.length > 0 ? (
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              {network.containers.map((container) => (
                                <Link
                                  key={container.id}
                                  to={`/containers/${container.id}`}
                                  className="font-medium hover:underline"
                                >
                                  {container.name}
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">None</span>
                          )}
                        </td>
                        <td
                          className="px-4 py-3"
                          title={new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "long" }).format(new Date(network.created))}
                        >
                          {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(network.created))}
                        </td>
                        <td className="w-12 px-2 py-3">
                          <ResourceMenu items={menuItems} triggerLabel={`Actions for ${network.name}`} />
                        </td>
                      </tr>
                      </ResourceMenu>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <CleanupConfirmDialog
        open={confirmingCleanup}
        resource="networks"
        description="This permanently removes every custom network not used by a container. Docker's default networks are preserved."
        pending={cleanupPending}
        error={cleanupError}
        onCancel={() => {
          setConfirmingCleanup(false)
          setCleanupError(null)
        }}
        onConfirm={() => {
          setCleanupPending(true)
          setCleanupError(null)
          void apiRequest<DockerCleanupResult>("/api/v1/network/cleanup", { method: "POST" })
            .then(() => {
              setConfirmingCleanup(false)
              networks.reload()
            })
            .catch((error) => setCleanupError(error instanceof Error ? error.message : "Cleanup failed."))
            .finally(() => setCleanupPending(false))
        }}
      />
      <DeleteConfirmDialog
        open={confirmingDelete}
        title={`Delete ${selected.size} ${selected.size === 1 ? "network" : "networks"}?`}
        description="Selected networks will be permanently removed. Default networks and networks used by containers cannot be deleted."
        deleting={deletePending}
        error={deleteError}
        onCancel={() => {
          setConfirmingDelete(false)
          setDeleteError(null)
        }}
        onConfirm={() => {
          setDeletePending(true)
          setDeleteError(null)
          const ids = [...selected]
          void Promise.allSettled(ids.map((id) => apiRequest(`/api/v1/network/${encodeURIComponent(id)}`, { method: "DELETE" })))
            .then((results) => {
              const failed = results.flatMap((result, index) => result.status === "rejected" ? [ids[index]] : [])
              networks.reload()
              setSelected(new Set(failed))
              if (failed.length === 0) {
                setConfirmingDelete(false)
              } else {
                const rejection = results.find((result) => result.status === "rejected")
                setDeleteError(rejection?.status === "rejected" && rejection.reason instanceof Error
                  ? rejection.reason.message
                  : `${failed.length} ${failed.length === 1 ? "network" : "networks"} could not be deleted.`)
              }
            })
            .finally(() => setDeletePending(false))
        }}
      />
      <NewNetworkDialog
        open={creatingNetwork}
        onClose={() => setCreatingNetwork(false)}
        onCreated={() => {
          setCreatingNetwork(false)
          networks.reload()
        }}
      />
    </section>
  )
}

type NetworkSortKey = "network" | "driver" | "scope" | "subnet" | "containers" | "created"

function NetworkDataRow({ icon: Icon, label, mono = false, value }: { icon: typeof Network; label: string; mono?: boolean; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`ml-auto truncate text-xs font-medium ${mono ? "font-mono" : ""}`} title={value}>{value}</span>
    </div>
  )
}
