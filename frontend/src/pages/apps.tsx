import { useMemo, useState, type KeyboardEvent } from "react"
import { ArrowUpRight, Plus } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { AppLogo } from "@/components/app-logo"
import { InstallAppDialog } from "@/components/install-app-dialog"
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
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { ViewToggle } from "@/components/view-toggle"
import { useApi } from "@/hooks/use-api"
import { useStoredViewMode } from "@/hooks/use-stored-view-mode"
import { getPublicAppUrl } from "@/lib/apps"
import type { AppResource } from "@/lib/types"

export function AppsPage() {
  const apps = useApi<Record<string, AppResource>>("/api/v1/app", {
    pollInterval: 1000,
  })
  const domainRequest = useApi<{ domain: string }>("/api/v1/ddns/domain")
  const [view, setView] = useStoredViewMode("containarr-apps-view")
  const [installOpen, setInstallOpen] = useState(false)
  const navigate = useNavigate()
  const items = apps.status === "success" ? Object.values(apps.data) : []
  const domain =
    domainRequest.status === "success" ? domainRequest.data.domain : null

  return (
    <section>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Apps"
          description="Apps are containers managed by Containarr, and are reachable on their own subdomains."
        />
        <div className="flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <Button type="button" onClick={() => setInstallOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            App
          </Button>
        </div>
      </div>

      {apps.status === "loading" && <CardGridSkeleton />}
      {apps.status === "error" && (
        <ErrorState message={apps.error} onRetry={apps.reload} />
      )}
      {apps.status === "success" && items.length === 0 && (
        <EmptyState>No apps have been configured yet.</EmptyState>
      )}
      {apps.status === "success" && items.length > 0 && (
        <>
          {view === "cards" ? (
            <AppsCardGrid items={items} domain={domain} navigate={navigate} />
          ) : (
            <>
              <div className="sm:hidden">
                <AppsCardGrid items={items} domain={domain} navigate={navigate} />
              </div>
              <AppsTable items={items} domain={domain} />
            </>
          )}
        </>
      )}

      <InstallAppDialog
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        onCreated={(app) => {
          setInstallOpen(false)
          apps.reload()
          navigate(`/apps/${app.id}`)
        }}
      />
    </section>
  )
}

function AppsCardGrid({
  domain,
  items,
  navigate,
}: {
  domain: string | null
  items: AppResource[]
  navigate: ReturnType<typeof useNavigate>
}) {
  function openFromKeyboard(event: KeyboardEvent, appId: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      navigate(`/apps/${appId}`)
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((app) => {
        const publicUrl = getPublicAppUrl(app, domain)
        return (
          <Card
            key={app.id}
            role="link"
            tabIndex={0}
            onClick={() => navigate(`/apps/${app.id}`)}
            onKeyDown={(event) => openFromKeyboard(event, app.id)}
            className="cursor-pointer overflow-hidden shadow-none transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-5">
              <div className="flex min-w-0 items-center gap-3">
                <AppLogo
                  appId={app.id}
                  alt={`${app.name || "App"} logo`}
                  className="size-10"
                />
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">
                    {app.name || "Unnamed app"}
                  </CardTitle>
                  {publicUrl && (
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                      className="mt-1 inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      <span className="truncate">{publicUrl}</span>
                      <ArrowUpRight className="size-3 shrink-0" />
                    </a>
                  )}
                </div>
              </div>
              <div className="shrink-0">
                <StatusBadge state={app.containerState || app.state} />
              </div>
            </CardHeader>
          </Card>
        )
      })}
    </div>
  )
}

function AppsTable({
  domain,
  items,
}: {
  domain: string | null
  items: AppResource[]
}) {
  const [sort, setSort] = useState<{ key: AppSortKey; direction: SortDirection } | null>(null)
  const sortedItems = useMemo(() => {
    if (!sort) return items

    return [...items].sort((left, right) => {
      const comparison = getAppSortValue(left, sort.key, domain).localeCompare(
        getAppSortValue(right, sort.key, domain),
        undefined,
        { numeric: true, sensitivity: "base" }
      )
      return sort.direction === "asc" ? comparison : -comparison
    })
  }, [domain, items, sort])

  function changeSort(key: AppSortKey) {
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
            <SortableTableHeader
              label="App"
              active={sort?.key === "app"}
              direction={sort?.direction || "asc"}
              onClick={() => changeSort("app")}
            />
            <SortableTableHeader
              label="Public URL"
              active={sort?.key === "url"}
              direction={sort?.direction || "asc"}
              onClick={() => changeSort("url")}
            />
            <SortableTableHeader
              label="Status"
              align="right"
              active={sort?.key === "status"}
              direction={sort?.direction || "asc"}
              onClick={() => changeSort("status")}
            />
          </tr>
        </thead>
        <tbody className="divide-y">
          {sortedItems.map((app) => {
            const publicUrl = getPublicAppUrl(app, domain)
            return (
              <tr key={app.id} className="hover:bg-muted/25">
                <td className="px-4 py-3">
                  <Link
                    to={`/apps/${app.id}`}
                    className="flex items-center gap-3 font-medium hover:underline"
                  >
                    <AppLogo appId={app.id} alt="" className="size-8" />
                    {app.name || "Unnamed app"}
                  </Link>
                </td>
                <td className="max-w-72 px-4 py-3">
                  {publicUrl ? (
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      <span className="truncate">{publicUrl}</span>
                      <ArrowUpRight className="size-3 shrink-0" />
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <StatusBadge state={app.containerState || app.state} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

type AppSortKey = "app" | "url" | "status"

function getAppSortValue(app: AppResource, key: AppSortKey, domain: string | null) {
  if (key === "app") return app.name || ""
  if (key === "url") return getPublicAppUrl(app, domain) || ""
  return app.containerState || app.state || ""
}
