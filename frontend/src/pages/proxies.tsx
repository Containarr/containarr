import { useMemo, useState, type KeyboardEvent } from "react"
import { ArrowRight, ArrowUpRight, Plus, Waypoints } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { ProxyDialog } from "@/components/new-proxy-dialog"
import { CertificateBadge } from "@/components/certificate-badge"
import { PageHeader } from "@/components/page-header"
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
import type { ProxyResource } from "@/lib/types"

export function ProxiesPage() {
  const proxies = useApi<Record<string, ProxyResource>>("/api/v1/proxy", {
    pollInterval: 1000,
  })
  const domainRequest = useApi<{ domain: string }>("/api/v1/ddns/domain")
  const [view, setView] = useStoredViewMode("containarr-proxies-view")
  const [newProxyOpen, setNewProxyOpen] = useState(false)
  const navigate = useNavigate()
  const items = proxies.status === "success" ? Object.values(proxies.data) : []
  const domain =
    domainRequest.status === "success" ? domainRequest.data.domain : null

  return (
    <section>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Proxies"
          description="Reverse proxies for services running outside Containarr."
        />
        <div className="flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          <Button type="button" onClick={() => setNewProxyOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            Proxy
          </Button>
        </div>
      </div>

      {proxies.status === "loading" && <CardGridSkeleton />}
      {proxies.status === "error" && (
        <ErrorState message={proxies.error} onRetry={proxies.reload} />
      )}
      {proxies.status === "success" && items.length === 0 && (
        <EmptyState>No proxies have been configured yet.</EmptyState>
      )}
      {proxies.status === "success" && items.length > 0 &&
        (view === "cards" ? (
          <ProxyCardGrid items={items} domain={domain} navigate={navigate} />
        ) : (
          <>
            <div className="sm:hidden">
              <ProxyCardGrid items={items} domain={domain} navigate={navigate} />
            </div>
            <ProxyTable items={items} domain={domain} />
          </>
        ))}

      <ProxyDialog
        open={newProxyOpen}
        onClose={() => setNewProxyOpen(false)}
        onSaved={(proxy) => {
          setNewProxyOpen(false)
          proxies.reload()
          navigate(`/proxies/${proxy.id}`)
        }}
      />
    </section>
  )
}

function ProxyCardGrid({
  domain,
  items,
  navigate,
}: {
  domain: string | null
  items: ProxyResource[]
  navigate: ReturnType<typeof useNavigate>
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
        return (
          <Card
            key={proxy.id}
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
              <CertificateBadge certificate={proxy.certificate} />
            </CardHeader>
            <CardContent>
              <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
                <ArrowRight className="size-3.5 shrink-0" />
                <span className="truncate">{proxy.sourceUrl}</span>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function ProxyTable({
  domain,
  items,
}: {
  domain: string | null
  items: ProxyResource[]
}) {
  const [sort, setSort] = useState<{
    key: ProxySortKey
    direction: SortDirection
  } | null>(null)
  const sortedItems = useMemo(() => {
    if (!sort) return items
    return [...items].sort((left, right) => {
      const comparison = getProxySortValue(left, sort.key, domain).localeCompare(
        getProxySortValue(right, sort.key, domain),
        undefined,
        { numeric: true, sensitivity: "base" }
      )
      return sort.direction === "asc" ? comparison : -comparison
    })
  }, [domain, items, sort])

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
              label="Certificate"
              active={sort?.key === "certificate"}
              direction={sort?.direction || "asc"}
              onClick={() => changeSort("certificate")}
            />
            <SortableTableHeader
              label="Source URL"
              active={sort?.key === "sourceUrl"}
              direction={sort?.direction || "asc"}
              onClick={() => changeSort("sourceUrl")}
            />
          </tr>
        </thead>
        <tbody className="divide-y">
          {sortedItems.map((proxy) => {
            const publicUrl = getPublicProxyUrl(proxy, domain)
            return (
              <tr key={proxy.id} className="hover:bg-muted/25">
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
                  <CertificateBadge certificate={proxy.certificate} />
                </td>
                <td className="max-w-72 px-4 py-3">
                  <ExternalLink href={proxy.sourceUrl} mono />
                </td>
              </tr>
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

type ProxySortKey = "proxy" | "publicUrl" | "certificate" | "sourceUrl"

function getProxySortValue(
  proxy: ProxyResource,
  key: ProxySortKey,
  domain: string | null
) {
  if (key === "proxy") return proxy.subdomain
  if (key === "publicUrl") return getPublicProxyUrl(proxy, domain) || ""
  if (key === "certificate") return proxy.certificate.status
  return proxy.sourceUrl
}
