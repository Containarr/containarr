import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { ArrowUpRight, FileDown, Globe2, Pencil, Plus, Power, PowerOff, ShieldCheck, Trash2 } from "lucide-react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"

import { AppLogo } from "@/components/app-logo"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { InstallAppDialog } from "@/components/install-app-dialog"
import { MobileHeaderAction } from "@/components/mobile-header-action"
import { PageHeader } from "@/components/page-header"
import { ResourceMenu, type ResourceMenuItem } from "@/components/resource-menu"
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
import { exportAppYaml, getPublicAppUrl } from "@/lib/apps"
import { apiRequest } from "@/lib/api"
import type { AppResource, ContainerResource, PolicyResource } from "@/lib/types"

export function AppsPage() {
  const apps = useApi<Record<string, AppResource>>("/api/v1/app", {
    pollInterval: 1000,
  })
  const domainRequest = useApi<{ domain: string }>("/api/v1/ddns/domain")
  const policies = useApi<Record<string, PolicyResource>>("/api/v1/firewall/policy")
  const containers = useApi<ContainerResource[]>("/api/v1/container")
  const [view, setView] = useStoredViewMode("containarr-apps-view")
  const [installOpen, setInstallOpen] = useState(false)
  const [deleting, setDeleting] = useState<AppResource | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const items = apps.status === "success"
    ? Object.values(apps.data).sort((left, right) =>
        (left.name || "Unnamed app").localeCompare((right.name || "Unnamed app"), undefined, { numeric: true, sensitivity: "base" })
        || left.id.localeCompare(right.id)
      )
    : []
  const importableContainers = containers.status === "success"
    ? containers.data.filter((container) => container.importable)
    : []
  const domain =
    domainRequest.status === "success" ? domainRequest.data.domain : null
  const policyNames = policies.status === "success"
    ? Object.fromEntries(Object.values(policies.data).map((policy) => [policy.id, policy.name]))
    : { public: "Public" }

  useEffect(() => {
    if (searchParams.get("new") === "1") setInstallOpen(true)
  }, [searchParams])

  return (
    <section>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Apps"
          description="Apps are containers managed by Containarr, and are reachable on their own subdomains."
        />
        <div className="flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <Button
            type="button"
            onClick={() => setInstallOpen(true)}
            className="hidden md:inline-flex"
          >
            <Plus className="mr-1.5 size-4" />
            App
          </Button>
        </div>
      </div>

      <MobileHeaderAction>
        <Button type="button" className="h-9" onClick={() => setInstallOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          App
        </Button>
      </MobileHeaderAction>

      {apps.status === "loading" && <CardGridSkeleton />}
      {apps.status === "error" && (
        <ErrorState message={apps.error} onRetry={apps.reload} />
      )}
      {apps.status === "success" && items.length === 0 && (
        <EmptyState>
          {importableContainers.length > 0 ? (
            <>
              No apps have been configured yet. You can import {importableContainers.length}{" "}
              existing {importableContainers.length === 1 ? "container" : "containers"}{" "}
              from <Link to="/containers" className="font-medium text-foreground underline underline-offset-4">Containers</Link>.
            </>
          ) : (
            "No apps have been configured yet."
          )}
        </EmptyState>
      )}
      {apps.status === "success" && items.length > 0 && (
        <>
          {view === "cards" ? (
            <AppsCardGrid items={items} domain={domain} policyNames={policyNames} navigate={navigate} onReload={apps.reload} onDelete={setDeleting} />
          ) : (
            <>
              <div className="sm:hidden">
                <AppsCardGrid items={items} domain={domain} policyNames={policyNames} navigate={navigate} onReload={apps.reload} onDelete={setDeleting} />
              </div>
              <AppsTable items={items} domain={domain} policyNames={policyNames} onReload={apps.reload} onDelete={setDeleting} />
            </>
          )}
        </>
      )}

      <InstallAppDialog
        open={installOpen}
        onClose={() => {
          setInstallOpen(false)
          if (searchParams.has("new") || searchParams.has("policyId")) {
            setSearchParams({}, { replace: true })
          }
        }}
        onCreated={(app) => {
          setInstallOpen(false)
          apps.reload()
          navigate(`/apps/${app.id}`)
        }}
      />
      <DeleteConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name || "app"}?`}
        description="This also removes its container. This action cannot be undone."
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
          void apiRequest(`/api/v1/app/${deleting.id}`, { method: "DELETE" })
            .then(() => {
              setDeleting(null)
              apps.reload()
            })
            .catch((error) => setDeleteError(error instanceof Error ? error.message : "Delete failed."))
            .finally(() => setDeletePending(false))
        }}
      />
    </section>
  )
}

function AppsCardGrid({
  domain,
  items,
  navigate,
  onDelete,
  onReload,
  policyNames,
}: {
  domain: string | null
  items: AppResource[]
  navigate: ReturnType<typeof useNavigate>
  onDelete: (app: AppResource) => void
  onReload: () => void
  policyNames: Record<string, string>
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
        const menuItems: ResourceMenuItem[] = [
          {
            label: "Open",
            icon: ArrowUpRight,
            onSelect: () => navigate(`/apps/${app.id}`),
          },
          {
            label: "Edit",
            icon: Pencil,
            onSelect: () => navigate(`/apps/${app.id}?edit=1`),
          },
          ...(publicUrl ? [{
            label: "Open public URL",
            icon: Globe2,
            onSelect: () => { window.open(publicUrl, "_blank", "noopener,noreferrer") },
          }] : []),
          {
            label: "Export as YAML",
            icon: FileDown,
            onSelect: () => exportAppYaml(app),
          },
          {
            label: app.disabled ? "Enable" : "Disable",
            icon: app.disabled ? Power : PowerOff,
            onSelect: () => apiRequest(`/api/v1/app/${app.id}/disabled`, {
              method: "PUT",
              body: JSON.stringify({ disabled: !app.disabled }),
            }).then(onReload),
          },
          {
            label: "Delete",
            icon: Trash2,
            destructive: true,
            onSelect: () => onDelete(app),
          },
        ]
        return (
          <ResourceMenu key={app.id} items={menuItems} triggerLabel={`Actions for ${app.name || "app"}`}>
          <Card
            role="link"
            tabIndex={0}
            onClick={() => navigate(`/apps/${app.id}`)}
            onKeyDown={(event) => openFromKeyboard(event, app.id)}
            className="cursor-pointer overflow-hidden shadow-none transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-5">
              <div className="flex min-w-0 items-center gap-3">
                <AppLogo
                  appId={app.hasLogo ? app.id : undefined}
                  alt={`${app.name || "App"} logo`}
                  className="size-10"
                />
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">
                    {app.name || "Unnamed app"}
                  </CardTitle>
                </div>
              </div>
              <AppStatusBadge app={app} />
            </CardHeader>
            <div
              className="flex min-w-0 items-center gap-1.5 border-t px-5 py-2.5 text-xs text-muted-foreground"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Link
                to={app.policyId === "public" ? "/firewall" : `/firewall?edit=${encodeURIComponent(app.policyId)}`}
                className="inline-flex shrink-0 items-center gap-1.5 font-medium underline-offset-4 hover:text-foreground hover:underline"
              >
                {app.policyId === "public" ? (
                  <Globe2 className="size-3.5 shrink-0" />
                ) : (
                  <ShieldCheck className="size-3.5 shrink-0" />
                )}
                {policyNames[app.policyId] ?? "Unknown"}
              </Link>
              {publicUrl && (
                <>
                  <span aria-hidden="true">・</span>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 flex-1 items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  <span className="min-w-0 truncate">{publicUrl}</span>
                  <ArrowUpRight className="size-3 shrink-0" />
                </a>
                </>
              )}
            </div>
          </Card>
          </ResourceMenu>
        )
      })}
    </div>
  )
}

function AppsTable({
  domain,
  items,
  policyNames,
  onDelete,
  onReload,
}: {
  domain: string | null
  items: AppResource[]
  policyNames: Record<string, string>
  onDelete: (app: AppResource) => void
  onReload: () => void
}) {
  const navigate = useNavigate()
  const [sort, setSort] = useState<{ key: AppSortKey; direction: SortDirection }>({ key: "app", direction: "asc" })
  const sortedItems = useMemo(() => {
    return [...items].sort((left, right) => {
      const comparison = getAppSortValue(left, sort.key, domain, policyNames).localeCompare(
        getAppSortValue(right, sort.key, domain, policyNames),
        undefined,
        { numeric: true, sensitivity: "base" }
      )
      return sort.direction === "asc" ? comparison : -comparison
    })
  }, [domain, items, policyNames, sort])

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
              label="Firewall Policy"
              active={sort?.key === "policy"}
              direction={sort?.direction || "asc"}
              onClick={() => changeSort("policy")}
            />
            <SortableTableHeader
              label="Status"
              align="right"
              active={sort?.key === "status"}
              direction={sort?.direction || "asc"}
              onClick={() => changeSort("status")}
            />
            <th className="w-12 px-2 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sortedItems.map((app) => {
            const publicUrl = getPublicAppUrl(app, domain)
            const menuItems: ResourceMenuItem[] = [
              {
                label: "Open",
                icon: ArrowUpRight,
                onSelect: () => navigate(`/apps/${app.id}`),
              },
              {
                label: "Edit",
                icon: Pencil,
                onSelect: () => navigate(`/apps/${app.id}?edit=1`),
              },
              ...(publicUrl ? [{
                label: "Open public URL",
                icon: Globe2,
                onSelect: () => { window.open(publicUrl, "_blank", "noopener,noreferrer") },
              }] : []),
              {
                label: "Export as YAML",
                icon: FileDown,
                onSelect: () => exportAppYaml(app),
              },
              {
                label: app.disabled ? "Enable" : "Disable",
                icon: app.disabled ? Power : PowerOff,
                onSelect: () => apiRequest(`/api/v1/app/${app.id}/disabled`, {
                  method: "PUT",
                  body: JSON.stringify({ disabled: !app.disabled }),
                }).then(onReload),
              },
              {
                label: "Delete",
                icon: Trash2,
                destructive: true,
                onSelect: () => onDelete(app),
              },
            ]
            return (
              <ResourceMenu key={app.id} items={menuItems} triggerLabel={`Actions for ${app.name || "app"}`}>
              <tr className="hover:bg-muted/25">
                <td className="px-4 py-3">
                  <Link
                    to={`/apps/${app.id}`}
                    className="flex items-center gap-3 font-medium hover:underline"
                  >
                    <AppLogo
                      appId={app.hasLogo ? app.id : undefined}
                      alt=""
                      className="size-8"
                    />
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
                <td className="px-4 py-3 text-muted-foreground">
                  <Link
                    to={app.policyId === "public" ? "/firewall" : `/firewall?edit=${encodeURIComponent(app.policyId)}`}
                    className="inline-flex items-center gap-2 underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {app.policyId === "public" ? (
                      <Globe2 className="size-4 shrink-0" />
                    ) : (
                      <ShieldCheck className="size-4 shrink-0" />
                    )}
                    {policyNames[app.policyId] ?? "Unknown"}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <AppStatusBadge app={app} />
                  </div>
                </td>
                <td className="w-12 px-2 py-3">
                  <ResourceMenu items={menuItems} triggerLabel={`Actions for ${app.name || "app"}`} />
                </td>
              </tr>
              </ResourceMenu>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

type AppSortKey = "app" | "policy" | "url" | "status"

function getAppSortValue(
  app: AppResource,
  key: AppSortKey,
  domain: string | null,
  policyNames: Record<string, string>
) {
  if (key === "app") return app.name || ""
  if (key === "policy") return policyNames[app.policyId] ?? ""
  if (key === "url") return getPublicAppUrl(app, domain) || ""
  return getAppStatus(app)
}

function AppStatusBadge({ app }: { app: AppResource }) {
  const state = app.state?.toLowerCase() ?? ""

  if (app.containerError && (!state || ["dead", "exited", "restarting"].includes(state))) {
    return <StatusBadge state="error" label="Error" />
  }

  if (app.disabled) return <StatusBadge state="disabled" label="Disabled" />

  if (app.certificate.status === "error") {
    return <StatusBadge state="error" label="Error" />
  }

  if (["provisioning", "renewing"].includes(app.certificate.status)) {
    return (
      <StatusBadge state="provisioning" label="Provisioning Certificate" />
    )
  }

  if (state === "running") return <StatusBadge state={state} label="Live" />
  return <StatusBadge state="starting" label="Starting" />
}

function getAppStatus(app: AppResource) {
  const state = app.state?.toLowerCase() ?? ""

  if (app.containerError && (!state || ["dead", "exited", "restarting"].includes(state))) {
    return "error"
  }
  if (app.disabled) return "disabled"
  if (app.certificate.status === "error") return "error"
  if (["provisioning", "renewing"].includes(app.certificate.status)) {
    return "provisioning certificate"
  }
  if (state === "running") return "live"
  return "starting"
}
