import { useMemo, useState, type KeyboardEvent } from "react"
import { Fingerprint, Link2, Package } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { ContainerAvatar } from "@/components/container-avatar"
import { PageHeader } from "@/components/page-header"
import {
  CardGridSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/resource-states"
import { StatusBadge } from "@/components/status-badge"
import {
  SortableTableHeader,
  type SortDirection,
} from "@/components/sortable-table-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ViewToggle } from "@/components/view-toggle"
import { useApi } from "@/hooks/use-api"
import { useStoredViewMode } from "@/hooks/use-stored-view-mode"
import { getComposeProject, getContainerAppId } from "@/lib/container-labels"
import type { AppResource, ContainerResource } from "@/lib/types"

export function ContainersPage() {
  const containers = useApi<ContainerResource[]>("/api/v1/container", {
    pollInterval: 1000,
  })
  const apps = useApi<Record<string, AppResource>>("/api/v1/app", {
    pollInterval: 1000,
  })
  const [view, setView] = useStoredViewMode("containarr-containers-view")
  const navigate = useNavigate()
  const items = containers.status === "success" ? containers.data : []
  const appsById = apps.status === "success" ? apps.data : {}

  return (
    <section>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Containers"
          description="Every Docker container available on this host."
        />
        <ViewToggle value={view} onChange={setView} />
      </div>

      {containers.status === "loading" && <CardGridSkeleton />}
      {containers.status === "error" && (
        <ErrorState message={containers.error} onRetry={containers.reload} />
      )}
      {containers.status === "success" && items.length === 0 && (
        <EmptyState>No containers were found on this host.</EmptyState>
      )}
      {containers.status === "success" && items.length > 0 &&
        (view === "cards" ? (
          <ContainersCardGrid
            items={items}
            apps={appsById}
            navigate={navigate}
          />
        ) : (
          <>
            <div className="sm:hidden">
              <ContainersCardGrid
                items={items}
                apps={appsById}
                navigate={navigate}
              />
            </div>
            <ContainersTable items={items} apps={appsById} />
          </>
        ))}
    </section>
  )
}

function ContainersCardGrid({
  apps,
  items,
  navigate,
}: {
  apps: Record<string, AppResource>
  items: ContainerResource[]
  navigate: ReturnType<typeof useNavigate>
}) {
  function openFromKeyboard(event: KeyboardEvent, containerId: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      navigate(`/containers/${containerId}`)
    }
  }

  const groups = groupContainers(items)

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.key}>
          <GroupHeader name={group.name} count={group.items.length} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((container) => {
              const appId = getContainerAppId(container)

              return (
              <Card
                key={container.id}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/containers/${container.id}`)}
                onKeyDown={(event) => openFromKeyboard(event, container.id)}
                className="cursor-pointer overflow-hidden shadow-none transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <ContainerAvatar
                      image={container.image}
                      alt=""
                      className="size-10"
                    />
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">
                        {container.name || "Unnamed container"}
                      </CardTitle>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {container.status}
                      </p>
                    </div>
                  </div>
                  <StatusBadge state={container.state} />
                </CardHeader>

                <CardContent className="mt-5 space-y-2.5">
                  <DataRow icon={Package} label="Image" value={container.image} />
                  <DataRow
                    icon={Fingerprint}
                    label="ID"
                    value={container.id.slice(0, 12)}
                  />
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <Link2 className="size-4 shrink-0 text-muted-foreground" />
                    <span className="shrink-0 text-muted-foreground">App</span>
                    {appId ? (
                      <Link
                        to={`/apps/${appId}`}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                        className="ml-auto truncate text-xs font-medium hover:underline"
                      >
                        {apps[appId]?.name || appId.slice(0, 12)}
                      </Link>
                    ) : (
                      <span className="ml-auto text-xs font-medium">Unmanaged</span>
                    )}
                  </div>
                </CardContent>
              </Card>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function DataRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package
  label: string
  value: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="ml-auto truncate font-mono text-xs font-medium">
        {value}
      </span>
    </div>
  )
}

function ContainersTable({
  apps,
  items,
}: {
  apps: Record<string, AppResource>
  items: ContainerResource[]
}) {
  const [sort, setSort] = useState<{
    key: ContainerSortKey
    direction: SortDirection
  } | null>(null)
  const groupedItems = useMemo(() => {
    const defaultItems = groupContainers(items).flatMap((group) => group.items)
    if (!sort) return defaultItems

    return [...defaultItems].sort((left, right) => {
      const leftStandalone = getComposeProject(left) ? 1 : 0
      const rightStandalone = getComposeProject(right) ? 1 : 0
      if (leftStandalone !== rightStandalone) return leftStandalone - rightStandalone

      const comparison = getContainerSortValue(left, sort.key, apps).localeCompare(
        getContainerSortValue(right, sort.key, apps),
        undefined,
        { numeric: true, sensitivity: "base" }
      )
      return sort.direction === "asc" ? comparison : -comparison
    })
  }, [apps, items, sort])

  function changeSort(key: ContainerSortKey) {
    setSort((current) => ({
      key,
      direction:
        current?.key === key && current.direction === "asc" ? "desc" : "asc",
    }))
  }

  return (
    <div className="hidden overflow-hidden rounded-xl border bg-card shadow-xs sm:block">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            {(["container", "group", "status", "image", "app"] as const).map(
              (key) => (
                <SortableTableHeader
                  key={key}
                  label={key.charAt(0).toUpperCase() + key.slice(1)}
                  active={sort?.key === key}
                  direction={sort?.direction || "asc"}
                  onClick={() => changeSort(key)}
                />
              )
            )}
          </tr>
        </thead>
        <tbody className="divide-y">
          {groupedItems.map((container) => {
            const appId = getContainerAppId(container)

            return (
            <tr key={container.id} className="hover:bg-muted/25">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <ContainerAvatar
                    image={container.image}
                    alt=""
                    className="size-8"
                  />
                  <div className="min-w-0">
                    <Link
                      to={`/containers/${container.id}`}
                      className="font-medium hover:underline"
                    >
                      {container.name || "Unnamed container"}
                    </Link>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {container.id.slice(0, 12)}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 font-medium">
                {getComposeProject(container) || "Standalone"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge state={container.state} />
              </td>
              <td className="max-w-72 truncate px-4 py-3 font-mono text-xs">
                {container.image}
              </td>
              <td className="px-4 py-3">
                {appId ? (
                  <Link
                    to={`/apps/${appId}`}
                    className="font-medium hover:underline"
                  >
                    {apps[appId]?.name || appId.slice(0, 12)}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Unmanaged</span>
                )}
              </td>
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

type ContainerSortKey = "container" | "group" | "status" | "image" | "app"

function getContainerSortValue(
  container: ContainerResource,
  key: ContainerSortKey,
  apps: Record<string, AppResource>
) {
  if (key === "container") return container.name || ""
  if (key === "group") return getComposeProject(container) || "Standalone"
  if (key === "status") return container.state
  if (key === "image") return container.image

  const appId = getContainerAppId(container)
  return appId ? apps[appId]?.name || appId : "Unmanaged"
}

function GroupHeader({ count, name }: { count: number; name: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h2 className="text-base font-semibold">{name}</h2>
      <span className="text-xs text-muted-foreground">
        {count} {count === 1 ? "container" : "containers"}
      </span>
    </div>
  )
}

function groupContainers(items: ContainerResource[]) {
  const groups = new Map<string, { key: string; name: string; items: ContainerResource[] }>()

  for (const container of items) {
    const project = getComposeProject(container)
    const key = project ? `compose:${project}` : "standalone"
    const group = groups.get(key) || {
      key,
      name: project || "Standalone",
      items: [],
    }
    group.items.push(container)
    groups.set(key, group)
  }

  return [...groups.values()].sort((left, right) => {
    if (left.key === "standalone") return -1
    if (right.key === "standalone") return 1
    return left.name.localeCompare(right.name)
  })
}
