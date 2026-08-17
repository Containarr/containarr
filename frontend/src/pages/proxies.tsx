import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { ArrowRight, ArrowUpRight, Globe2, Pencil, Plus, Power, PowerOff, Trash2, Waypoints } from "lucide-react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"

import { ProxyDialog } from "@/components/new-proxy-dialog"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { MobileHeaderAction } from "@/components/mobile-header-action"
import { PageHeader } from "@/components/page-header"
import { ResourceMenu, type ResourceMenuItem } from "@/components/resource-menu"
import { StatusBadge } from "@/components/status-badge"
import {
  CardGridSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/resource-states"
import {
  SortableTableHeader,
  type SortDirection,
} from "@/components/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ViewToggle } from "@/components/view-toggle"
import { useApi } from "@/hooks/use-api"
import { useStoredViewMode } from "@/hooks/use-stored-view-mode"
import { getPublicProxyUrl } from "@/lib/proxies"
import { apiRequest } from "@/lib/api"
import type { PolicyResource, ProxyResource } from "@/lib/types"

export function ProxiesPage() {
  const proxies = useApi<Record<string, ProxyResource>>("/api/v1/proxy", {
    pollInterval: 1000,
  })
  const domainRequest = useApi<{ domain: string }>("/api/v1/ddns/domain")
  const policies = useApi<Record<string, PolicyResource>>("/api/v1/firewall/policy")
  const [view, setView] = useStoredViewMode("containarr-proxies-view")
  const [newProxyOpen, setNewProxyOpen] = useState(false)
  const [deleting, setDeleting] = useState<ProxyResource | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const items = proxies.status === "success" ? Object.values(proxies.data) : []
  const domain =
    domainRequest.status === "success" ? domainRequest.data.domain : null
  const policyNames = policies.status === "success"
    ? Object.fromEntries(Object.values(policies.data).map((policy) => [policy.id, policy.name]))
    : { public: "Public" }

  useEffect(() => {
    if (searchParams.get("new") === "1") setNewProxyOpen(true)
  }, [searchParams])

  return (
    <section>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Proxies"
          description="Publish services running outside Containarr on your domain."
        />
        <div className="flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <Button
            type="button"
            onClick={() => setNewProxyOpen(true)}
            className="hidden md:inline-flex"
          >
            <Plus className="mr-1.5 size-4" />
            Proxy
          </Button>
        </div>
      </div>

      <MobileHeaderAction>
        <Button type="button" className="h-9" onClick={() => setNewProxyOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          Proxy
        </Button>
      </MobileHeaderAction>

      {proxies.status === "loading" && <CardGridSkeleton />}
      {proxies.status === "error" && (
        <ErrorState message={proxies.error} onRetry={proxies.reload} />
      )}
      {proxies.status === "success" && items.length === 0 && (
        <EmptyState>No proxies have been configured yet.</EmptyState>
      )}
      {proxies.status === "success" && items.length > 0 &&
        (view === "cards" ? (
          <ProxyCardGrid items={items} domain={domain} policyNames={policyNames} navigate={navigate} onReload={proxies.reload} onDelete={setDeleting} />
        ) : (
          <>
            <div className="sm:hidden">
              <ProxyCardGrid items={items} domain={domain} policyNames={policyNames} navigate={navigate} onReload={proxies.reload} onDelete={setDeleting} />
            </div>
            <ProxyTable items={items} domain={domain} policyNames={policyNames} onReload={proxies.reload} onDelete={setDeleting} />
          </>
        ))}

      <ProxyDialog
        open={newProxyOpen}
        onClose={() => {
          setNewProxyOpen(false)
          if (searchParams.has("new") || searchParams.has("policyId")) {
            setSearchParams({}, { replace: true })
          }
        }}
        onSaved={(proxy) => {
          setNewProxyOpen(false)
          proxies.reload()
          navigate(`/proxies/${proxy.id}`)
        }}
      />
      <DeleteConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.subdomain || "proxy"}?`}
        description="This removes the reverse proxy rule. This action cannot be undone."
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
          void apiRequest(`/api/v1/proxy/${deleting.id}`, { method: "DELETE" })
            .then(() => {
              setDeleting(null)
              proxies.reload()
            })
            .catch((error) => setDeleteError(error instanceof Error ? error.message : "Delete failed."))
            .finally(() => setDeletePending(false))
        }}
      />
    </section>
  )
}

function ProxyCardGrid({
  domain,
  items,
  navigate,
  onDelete,
  onReload,
  policyNames,
}: {
  domain: string | null
  items: ProxyResource[]
  navigate: ReturnType<typeof useNavigate>
  onDelete: (proxy: ProxyResource) => void
  onReload: () => void
  policyNames: Record<string, string>
}) {
  function openFromKeyboard(event: KeyboardEvent, proxyId: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      navigate(`/proxies/${proxyId}`)
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((proxy) => {
        const publicUrl = getPublicProxyUrl(proxy, domain)
        const menuItems: ResourceMenuItem[] = [
          {
            label: "Open",
            icon: ArrowUpRight,
            onSelect: () => navigate(`/proxies/${proxy.id}`),
          },
          {
            label: "Edit",
            icon: Pencil,
            onSelect: () => navigate(`/proxies/${proxy.id}?edit=1`),
          },
          ...(publicUrl ? [{
            label: "Open public URL",
            icon: Globe2,
            onSelect: () => { window.open(publicUrl, "_blank", "noopener,noreferrer") },
          }] : []),
          {
            label: proxy.disabled ? "Enable" : "Disable",
            icon: proxy.disabled ? Power : PowerOff,
            onSelect: () => apiRequest(`/api/v1/proxy/${proxy.id}/disabled`, {
              method: "PUT",
              body: JSON.stringify({ disabled: !proxy.disabled }),
            }).then(onReload),
          },
          {
            label: "Delete",
            icon: Trash2,
            destructive: true,
            onSelect: () => onDelete(proxy),
          },
        ]
        return (
          <ResourceMenu key={proxy.id} items={menuItems} triggerLabel={`Actions for ${proxy.subdomain}`}>
          <Card
            role="link"
            tabIndex={0}
            onClick={() => navigate(`/proxies/${proxy.id}`)}
            onKeyDown={(event) => openFromKeyboard(event, proxy.id)}
            className="cursor-pointer overflow-hidden shadow-none transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
                  <Waypoints className="size-5 text-muted-foreground" />
                </span>
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">
                    {proxy.subdomain}
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
              {proxy.disabled ? (
                <StatusBadge state="disabled" label="Disabled" />
              ) : proxy.certificate.status === "error" ? (
                <StatusBadge state="error" label="Error" />
              ) : ["provisioning", "renewing"].includes(proxy.certificate.status) ? (
                <StatusBadge state="provisioning" label="Provisioning Certificate" />
              ) : (
                <StatusBadge state="running" label="Live" />
              )}
            </CardHeader>
            <CardContent>
              <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
                <ArrowRight className="size-3.5 shrink-0" />
                <span className="truncate">{proxy.sourceUrl}</span>
              </div>
            </CardContent>
            <div
              className="border-t px-5 py-2.5 text-xs text-muted-foreground"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Link
                to={proxy.policyId === "public" ? "/firewall" : `/firewall?edit=${encodeURIComponent(proxy.policyId)}`}
                className="font-medium underline-offset-4 hover:text-foreground hover:underline"
              >
                {policyNames[proxy.policyId] ?? "Unknown"}
              </Link>
            </div>
          </Card>
          </ResourceMenu>
        )
      })}
    </div>
  )
}

function ProxyTable({
  domain,
  items,
  policyNames,
  onDelete,
  onReload,
}: {
  domain: string | null
  items: ProxyResource[]
  policyNames: Record<string, string>
  onDelete: (proxy: ProxyResource) => void
  onReload: () => void
}) {
  const navigate = useNavigate()
  const [sort, setSort] = useState<{
    key: ProxySortKey
    direction: SortDirection
  } | null>(null)
  const sortedItems = useMemo(() => {
    if (!sort) return items
    return [...items].sort((left, right) => {
      const comparison = getProxySortValue(left, sort.key, domain, policyNames).localeCompare(
        getProxySortValue(right, sort.key, domain, policyNames),
        undefined,
        { numeric: true, sensitivity: "base" }
      )
      return sort.direction === "asc" ? comparison : -comparison
    })
  }, [domain, items, policyNames, sort])

  function changeSort(key: ProxySortKey) {
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
              label="Proxy"
              active={sort?.key === "proxy"}
              direction={sort?.direction || "asc"}
              onClick={() => changeSort("proxy")}
            />
            <SortableTableHeader
              label="Public URL"
              active={sort?.key === "publicUrl"}
              direction={sort?.direction || "asc"}
              onClick={() => changeSort("publicUrl")}
            />
            <SortableTableHeader
              label="Firewall Policy"
              active={sort?.key === "policy"}
              direction={sort?.direction || "asc"}
              onClick={() => changeSort("policy")}
            />
            <SortableTableHeader
              label="Status"
              active={sort?.key === "status"}
              direction={sort?.direction || "asc"}
              onClick={() => changeSort("status")}
            />
            <SortableTableHeader
              label="Source URL"
              active={sort?.key === "sourceUrl"}
              direction={sort?.direction || "asc"}
              onClick={() => changeSort("sourceUrl")}
            />
            <th className="w-12 px-2 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sortedItems.map((proxy) => {
            const publicUrl = getPublicProxyUrl(proxy, domain)
            const menuItems: ResourceMenuItem[] = [
              {
                label: "Open",
                icon: ArrowUpRight,
                onSelect: () => navigate(`/proxies/${proxy.id}`),
              },
              {
                label: "Edit",
                icon: Pencil,
                onSelect: () => navigate(`/proxies/${proxy.id}?edit=1`),
              },
              ...(publicUrl ? [{
                label: "Open public URL",
                icon: Globe2,
                onSelect: () => { window.open(publicUrl, "_blank", "noopener,noreferrer") },
              }] : []),
              {
                label: proxy.disabled ? "Enable" : "Disable",
                icon: proxy.disabled ? Power : PowerOff,
                onSelect: () => apiRequest(`/api/v1/proxy/${proxy.id}/disabled`, {
                  method: "PUT",
                  body: JSON.stringify({ disabled: !proxy.disabled }),
                }).then(onReload),
              },
              {
                label: "Delete",
                icon: Trash2,
                destructive: true,
                onSelect: () => onDelete(proxy),
              },
            ]
            return (
              <ResourceMenu key={proxy.id} items={menuItems} triggerLabel={`Actions for ${proxy.subdomain}`}>
              <tr className="hover:bg-muted/25">
                <td className="px-4 py-3">
                  <Link
                    to={`/proxies/${proxy.id}`}
                    className="flex items-center gap-2.5 font-medium hover:underline"
                  >
                    <Waypoints className="size-4 text-muted-foreground" />
                    {proxy.subdomain}
                  </Link>
                </td>
                <td className="max-w-72 px-4 py-3">
                  {publicUrl ? (
                    <ExternalLink href={publicUrl} />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={proxy.policyId === "public" ? "/firewall" : `/firewall?edit=${encodeURIComponent(proxy.policyId)}`}
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {policyNames[proxy.policyId] ?? "Unknown"}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {proxy.disabled ? (
                    <StatusBadge state="disabled" label="Disabled" />
                  ) : proxy.certificate.status === "error" ? (
                    <StatusBadge state="error" label="Error" />
                  ) : ["provisioning", "renewing"].includes(proxy.certificate.status) ? (
                    <StatusBadge state="provisioning" label="Provisioning Certificate" />
                  ) : (
                    <StatusBadge state="running" label="Live" />
                  )}
                </td>
                <td className="max-w-72 px-4 py-3">
                  <ExternalLink href={proxy.sourceUrl} mono />
                </td>
                <td className="w-12 px-2 py-3">
                  <ResourceMenu items={menuItems} triggerLabel={`Actions for ${proxy.subdomain}`} />
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

function ExternalLink({ href, mono = false }: { href: string; mono?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex max-w-full items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline ${mono ? "font-mono text-xs" : ""}`}
    >
      <span className="truncate">{href}</span>
      <ArrowUpRight className="size-3 shrink-0" />
    </a>
  )
}

type ProxySortKey = "proxy" | "publicUrl" | "policy" | "status" | "sourceUrl"

function getProxySortValue(
  proxy: ProxyResource,
  key: ProxySortKey,
  domain: string | null,
  policyNames: Record<string, string>
) {
  if (key === "proxy") return proxy.subdomain
  if (key === "publicUrl") return getPublicProxyUrl(proxy, domain) || ""
  if (key === "policy") return policyNames[proxy.policyId] ?? ""
  if (key === "status") {
    if (proxy.disabled) return "disabled"
    if (proxy.certificate.status === "error") return "error"
    if (["provisioning", "renewing"].includes(proxy.certificate.status)) return "provisioning"
    return "live"
  }
  return proxy.sourceUrl
}
