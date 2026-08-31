import { useMemo, useState } from "react"
import { ArrowUpRight, CalendarDays, Container, Eraser, Fingerprint, HardDrive, Tags, Trash2 } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { CleanupConfirmDialog } from "@/components/cleanup-confirm-dialog"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { MobileHeaderAction } from "@/components/mobile-header-action"
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
import type { DockerCleanupResult, DockerImageResource } from "@/lib/types"

export function ImagesPage() {
  const navigate = useNavigate()
  const images = useApi<DockerImageResource[]>("/api/v1/image", { pollInterval: 5000 })
  const [view, setView] = useStoredViewMode("containarr-images-view")
  const [confirmingCleanup, setConfirmingCleanup] = useState(false)
  const [cleanupPending, setCleanupPending] = useState(false)
  const [cleanupError, setCleanupError] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: ImageSortKey; direction: SortDirection } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const items = images.status === "success" ? images.data : []
  const sortedItems = useMemo(() => {
    if (!sort) return items
    return [...items].sort((left, right) => {
      const leftValue = sort.key === "image" ? left.tags[0] || "Untagged image"
        : sort.key === "id" ? left.id
          : sort.key === "size" ? left.size
            : sort.key === "containers" ? left.containers.map((container) => container.name).join(", ")
              : left.created
      const rightValue = sort.key === "image" ? right.tags[0] || "Untagged image"
        : sort.key === "id" ? right.id
          : sort.key === "size" ? right.size
            : sort.key === "containers" ? right.containers.map((container) => container.name).join(", ")
              : right.created
      const comparison = String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" })
      return sort.direction === "asc" ? comparison : -comparison
    })
  }, [items, sort])
  const selectableItems = sortedItems.filter((image) => image.containers.length === 0)
  const allSelected = selectableItems.length > 0 && selectableItems.every((image) => selected.has(image.id))
  const someSelected = selectableItems.some((image) => selected.has(image.id))

  function changeSort(key: ImageSortKey) {
    setSort((current) => ({
      key,
      direction: current?.key === key && current.direction === "asc" ? "desc" : "asc",
    }))
  }

  return (
    <section>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <PageHeader title="Images" description="Docker images available on this host." />
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" className="hidden md:inline-flex" onClick={() => setConfirmingCleanup(true)}>
            <Eraser className="mr-2 size-4" />
            Cleanup
          </Button>
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      <MobileHeaderAction>
        <Button type="button" variant="outline" className="h-9" onClick={() => setConfirmingCleanup(true)}>
          <Eraser className="mr-1.5 size-4" />
          Cleanup
        </Button>
      </MobileHeaderAction>

      {images.status === "loading" && <CardGridSkeleton />}
      {images.status === "error" && <ErrorState message={images.error} onRetry={images.reload} />}
      {images.status === "success" && items.length === 0 && <EmptyState>No images were found on this host.</EmptyState>}
      {images.status === "success" && items.length > 0 && (
        <>
          <div className={view === "cards" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "grid gap-4 sm:hidden"}>
            {items.map((image) => {
              const name = image.tags[0] || "Untagged image"
              const menuItems: ResourceMenuItem[] = [
                ...image.containers.map((container) => ({
                  label: `Open ${container.name}`,
                  icon: ArrowUpRight,
                  onSelect: () => navigate(`/containers/${container.id}`),
                })),
                {
                label: "Delete",
                icon: Trash2,
                destructive: true,
                disabled: image.containers.length > 0,
                onSelect: () => {
                  setSelected(new Set([image.id]))
                  setConfirmingDelete(true)
                },
                },
              ]
              return (
                <ResourceMenu key={image.id} items={menuItems} triggerLabel={`Actions for ${name}`}>
                <Card className="gap-5 p-5 shadow-none">
                  <CardHeader className="flex flex-row items-center gap-3 p-0">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <HardDrive className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{name}</CardTitle>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {image.tags.length > 1 ? `${image.tags.length - 1} more tags` : "Docker image"}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2.5 p-0">
                    <ImageDataRow icon={Fingerprint} label="ID" value={image.id.replace(/^sha256:/, "").slice(0, 12)} />
                    <ImageDataRow icon={Tags} label="Tags" value={`${image.tags.length}`} />
                    <div className="flex min-w-0 items-start gap-2 text-sm">
                      <Container className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="shrink-0 text-muted-foreground">Containers</span>
                      {image.containers.length > 0 ? (
                        <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-x-2 gap-y-1 text-xs">
                          {image.containers.map((container) => (
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
                    <ImageDataRow icon={HardDrive} label="Size" value={formatImageBytes(image.size)} />
                    <ImageDataRow icon={CalendarDays} label="Created" value={new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(image.created))} />
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
                          aria-label="Select all unused images"
                          checked={allSelected}
                          disabled={selectableItems.length === 0}
                          ref={(input) => { if (input) input.indeterminate = someSelected && !allSelected }}
                          onChange={() => setSelected(allSelected ? new Set() : new Set(selectableItems.map((image) => image.id)))}
                          className="size-4 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </th>
                      {(["image", "id", "size", "containers", "created"] as const).map((key) => (
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
                    {sortedItems.map((image) => {
                      const name = image.tags[0] || "Untagged image"
                      const menuItems: ResourceMenuItem[] = [
                        ...image.containers.map((container) => ({
                          label: `Open ${container.name}`,
                          icon: ArrowUpRight,
                          onSelect: () => navigate(`/containers/${container.id}`),
                        })),
                        {
                        label: "Delete",
                        icon: Trash2,
                        destructive: true,
                        disabled: image.containers.length > 0,
                        onSelect: () => {
                          setSelected(new Set([image.id]))
                          setConfirmingDelete(true)
                        },
                        },
                      ]
                      return (
                      <ResourceMenu key={image.id} items={menuItems} triggerLabel={`Actions for ${name}`}>
                      <tr className="hover:bg-muted/25">
                        <td className="w-12 px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${image.tags[0] || "untagged image"}`}
                            checked={selected.has(image.id)}
                            disabled={image.containers.length > 0}
                            title={image.containers.length > 0 ? "Images used by containers cannot be deleted." : undefined}
                            onChange={() => setSelected((current) => {
                              const next = new Set(current)
                              if (next.has(image.id)) next.delete(image.id)
                              else next.add(image.id)
                              return next
                            })}
                            className="size-4 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </td>
                        <td className="max-w-80 px-4 py-3">
                          <p className="truncate font-medium">{image.tags[0] || "Untagged image"}</p>
                          {image.tags.length > 1 && <p className="mt-0.5 text-xs text-muted-foreground">{image.tags.length} tags</p>}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{image.id.replace(/^sha256:/, "").slice(0, 12)}</td>
                        <td className="px-4 py-3">{formatImageBytes(image.size)}</td>
                        <td className="px-4 py-3">
                          {image.containers.length > 0 ? (
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              {image.containers.map((container) => (
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
                          title={new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "long" }).format(new Date(image.created))}
                        >
                          {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(image.created))}
                        </td>
                        <td className="w-12 px-2 py-3">
                          <ResourceMenu items={menuItems} triggerLabel={`Actions for ${name}`} />
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
        resource="images"
        description="This permanently removes every image not used by a container. Images can be downloaded again when needed."
        pending={cleanupPending}
        error={cleanupError}
        onCancel={() => {
          setConfirmingCleanup(false)
          setCleanupError(null)
        }}
        onConfirm={() => {
          setCleanupPending(true)
          setCleanupError(null)
          void apiRequest<DockerCleanupResult>("/api/v1/image/cleanup", { method: "POST" })
            .then(() => {
              setConfirmingCleanup(false)
              images.reload()
            })
            .catch((error) => setCleanupError(error instanceof Error ? error.message : "Cleanup failed."))
            .finally(() => setCleanupPending(false))
        }}
      />
      <DeleteConfirmDialog
        open={confirmingDelete}
        title={`Delete ${selected.size} ${selected.size === 1 ? "image" : "images"}?`}
        description="Selected images will be permanently removed. Images used by containers cannot be deleted."
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
          void Promise.allSettled(ids.map((id) => apiRequest(`/api/v1/image/${encodeURIComponent(id)}`, { method: "DELETE" })))
            .then((results) => {
              const failed = results.flatMap((result, index) => result.status === "rejected" ? [ids[index]] : [])
              images.reload()
              setSelected(new Set(failed))
              if (failed.length === 0) {
                setConfirmingDelete(false)
              } else {
                const rejection = results.find((result) => result.status === "rejected")
                setDeleteError(rejection?.status === "rejected" && rejection.reason instanceof Error
                  ? rejection.reason.message
                  : `${failed.length} ${failed.length === 1 ? "image" : "images"} could not be deleted.`)
              }
            })
            .finally(() => setDeletePending(false))
        }}
      />
    </section>
  )
}

type ImageSortKey = "image" | "id" | "size" | "containers" | "created"

function ImageDataRow({ icon: Icon, label, value }: { icon: typeof HardDrive; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto truncate text-xs font-medium">{value}</span>
    </div>
  )
}

function formatImageBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length)
  return `${(bytes / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${units[unit - 1]}`
}
