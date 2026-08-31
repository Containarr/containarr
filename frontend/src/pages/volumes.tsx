import { useMemo, useState } from "react"
import { ArrowUpRight, CalendarDays, Container, Database, Eraser, FolderOpen, Settings2, Trash2 } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { CleanupConfirmDialog } from "@/components/cleanup-confirm-dialog"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
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
import type { DockerCleanupResult, DockerVolumeResource } from "@/lib/types"

export function VolumesPage() {
  const navigate = useNavigate()
  const volumes = useApi<DockerVolumeResource[]>("/api/v1/volume", { pollInterval: 30000 })
  const [view, setView] = useStoredViewMode("containarr-volumes-view")
  const [confirmingCleanup, setConfirmingCleanup] = useState(false)
  const [cleanupPending, setCleanupPending] = useState(false)
  const [cleanupError, setCleanupError] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: VolumeSortKey; direction: SortDirection } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const items = volumes.status === "success" ? volumes.data : []
  const sortedItems = useMemo(() => {
    if (!sort) return items
    return [...items].sort((left, right) => {
      const leftValue = sort.key === "volume" ? left.name
        : sort.key === "driver" ? left.driver
          : sort.key === "scope" ? left.scope
            : sort.key === "containers" ? left.containers.map((container) => container.name).join(", ")
              : sort.key === "size" ? left.size ?? -1
                : left.created ?? ""
      const rightValue = sort.key === "volume" ? right.name
        : sort.key === "driver" ? right.driver
          : sort.key === "scope" ? right.scope
            : sort.key === "containers" ? right.containers.map((container) => container.name).join(", ")
              : sort.key === "size" ? right.size ?? -1
                : right.created ?? ""
      const comparison = String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" })
      return sort.direction === "asc" ? comparison : -comparison
    })
  }, [items, sort])
  const selectableItems = sortedItems.filter((volume) => volume.deletable)
  const allSelected = selectableItems.length > 0 && selectableItems.every((volume) => selected.has(volume.name))
  const someSelected = selectableItems.some((volume) => selected.has(volume.name))

  function changeSort(key: VolumeSortKey) {
    setSort((current) => ({
      key,
      direction: current?.key === key && current.direction === "asc" ? "desc" : "asc",
    }))
  }

  return (
    <section>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <PageHeader title="Volumes" description="Persistent Docker data stored on this host." />
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setConfirmingCleanup(true)}>
            <Eraser className="mr-2 size-4" />
            Cleanup
          </Button>
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {volumes.status === "loading" && <CardGridSkeleton />}
      {volumes.status === "error" && <ErrorState message={volumes.error} onRetry={volumes.reload} />}
      {volumes.status === "success" && items.length === 0 && <EmptyState>No volumes were found on this host.</EmptyState>}
      {volumes.status === "success" && items.length > 0 && (
        <>
          <div className={view === "cards" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "grid gap-4 sm:hidden"}>
            {items.map((volume) => {
              const menuItems: ResourceMenuItem[] = [
                ...volume.containers.map((container) => ({
                  label: `Open ${container.name}`,
                  icon: ArrowUpRight,
                  onSelect: () => navigate(`/containers/${container.id}`),
                })),
                {
                  label: "Delete",
                  icon: Trash2,
                  destructive: true,
                  disabled: !volume.deletable,
                  onSelect: () => {
                    setSelected(new Set([volume.name]))
                    setConfirmingDelete(true)
                  },
                },
              ]
              return (
              <ResourceMenu key={volume.name} items={menuItems} triggerLabel={`Actions for ${volume.name}`}>
              <Card className="gap-5 p-5 shadow-none">
                <CardHeader className="flex flex-row items-center gap-3 p-0">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                    <Database className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{volume.name}</CardTitle>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{volume.driver} driver</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2.5 p-0">
                  <VolumeDataRow icon={Settings2} label="Scope" value={volume.scope} />
                  <div className="flex min-w-0 items-start gap-2 text-sm">
                    <Container className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="shrink-0 text-muted-foreground">Containers</span>
                    {volume.containers.length > 0 ? (
                      <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-x-2 gap-y-1 text-xs">
                        {volume.containers.map((container) => (
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
                  <VolumeDataRow icon={Database} label="Size" value={volume.size === null || volume.size < 0 ? "Unknown" : formatVolumeBytes(volume.size)} />
                  <VolumeDataRow icon={FolderOpen} label="Mountpoint" value={volume.mountpoint} mono />
                  <VolumeDataRow icon={CalendarDays} label="Created" value={volume.created ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(volume.created)) : "Unknown"} />
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
                          aria-label="Select all unused volumes"
                          checked={allSelected}
                          disabled={selectableItems.length === 0}
                          ref={(input) => { if (input) input.indeterminate = someSelected && !allSelected }}
                          onChange={() => setSelected(allSelected ? new Set() : new Set(selectableItems.map((volume) => volume.name)))}
                          className="size-4 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </th>
                      {(["volume", "driver", "scope", "containers", "size", "created"] as const).map((key) => (
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
                    {sortedItems.map((volume) => {
                      const menuItems: ResourceMenuItem[] = [
                        ...volume.containers.map((container) => ({
                          label: `Open ${container.name}`,
                          icon: ArrowUpRight,
                          onSelect: () => navigate(`/containers/${container.id}`),
                        })),
                        {
                          label: "Delete",
                          icon: Trash2,
                          destructive: true,
                          disabled: !volume.deletable,
                          onSelect: () => {
                            setSelected(new Set([volume.name]))
                            setConfirmingDelete(true)
                          },
                        },
                      ]
                      return (
                      <ResourceMenu key={volume.name} items={menuItems} triggerLabel={`Actions for ${volume.name}`}>
                      <tr className="hover:bg-muted/25">
                        <td className="w-12 px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${volume.name}`}
                            checked={selected.has(volume.name)}
                            disabled={!volume.deletable}
                            title={!volume.deletable
                              ? volume.refCount === null
                                ? "Volume usage could not be determined."
                                : "Volumes used by containers cannot be deleted."
                              : undefined}
                            onChange={() => setSelected((current) => {
                              const next = new Set(current)
                              if (next.has(volume.name)) next.delete(volume.name)
                              else next.add(volume.name)
                              return next
                            })}
                            className="size-4 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </td>
                        <td className="max-w-96 px-4 py-3">
                          <p className="truncate font-medium">{volume.name}</p>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{volume.mountpoint}</p>
                        </td>
                        <td className="px-4 py-3">{volume.driver}</td>
                        <td className="px-4 py-3">{volume.scope}</td>
                        <td className="px-4 py-3">
                          {volume.containers.length > 0 ? (
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              {volume.containers.map((container) => (
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
                        <td className="px-4 py-3">{volume.size === null || volume.size < 0 ? "Unknown" : formatVolumeBytes(volume.size)}</td>
                        <td
                          className="px-4 py-3"
                          title={volume.created
                            ? new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "long" }).format(new Date(volume.created))
                            : undefined}
                        >
                          {volume.created ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(volume.created)) : "Unknown"}
                        </td>
                        <td className="w-12 px-2 py-3">
                          <ResourceMenu items={menuItems} triggerLabel={`Actions for ${volume.name}`} />
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
        resource="volumes"
        description="This permanently removes every volume not used by a container, including named volumes and their stored data."
        pending={cleanupPending}
        error={cleanupError}
        onCancel={() => {
          setConfirmingCleanup(false)
          setCleanupError(null)
        }}
        onConfirm={() => {
          setCleanupPending(true)
          setCleanupError(null)
          void apiRequest<DockerCleanupResult>("/api/v1/volume/cleanup", { method: "POST" })
            .then(() => {
              setConfirmingCleanup(false)
              volumes.reload()
            })
            .catch((error) => setCleanupError(error instanceof Error ? error.message : "Cleanup failed."))
            .finally(() => setCleanupPending(false))
        }}
      />
      <DeleteConfirmDialog
        open={confirmingDelete}
        title={`Delete ${selected.size} ${selected.size === 1 ? "volume" : "volumes"}?`}
        description="Selected volumes and all data stored in them will be permanently removed. Volumes used by containers cannot be deleted."
        deleting={deletePending}
        error={deleteError}
        onCancel={() => {
          setConfirmingDelete(false)
          setDeleteError(null)
        }}
        onConfirm={() => {
          setDeletePending(true)
          setDeleteError(null)
          const names = [...selected]
          void Promise.allSettled(names.map((name) => apiRequest(`/api/v1/volume/${encodeURIComponent(name)}`, { method: "DELETE" })))
            .then((results) => {
              const failed = results.flatMap((result, index) => result.status === "rejected" ? [names[index]] : [])
              volumes.reload()
              setSelected(new Set(failed))
              if (failed.length === 0) {
                setConfirmingDelete(false)
              } else {
                const rejection = results.find((result) => result.status === "rejected")
                setDeleteError(rejection?.status === "rejected" && rejection.reason instanceof Error
                  ? rejection.reason.message
                  : `${failed.length} ${failed.length === 1 ? "volume" : "volumes"} could not be deleted.`)
              }
            })
            .finally(() => setDeletePending(false))
        }}
      />
    </section>
  )
}

type VolumeSortKey = "volume" | "driver" | "scope" | "containers" | "size" | "created"

function VolumeDataRow({ icon: Icon, label, mono = false, value }: { icon: typeof Database; label: string; mono?: boolean; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`ml-auto truncate text-xs font-medium ${mono ? "font-mono" : ""}`} title={value}>{value}</span>
    </div>
  )
}

function formatVolumeBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length)
  return `${(bytes / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${units[unit - 1]}`
}
