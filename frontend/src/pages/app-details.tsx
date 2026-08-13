import { useState } from "react"
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Box,
  LoaderCircle,
  Network,
  Settings2,
  Trash2,
} from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { AppLogo } from "@/components/app-logo"
import { ErrorState } from "@/components/resource-states"
import { ResourceActions } from "@/components/resource-actions"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"
import { apiRequest } from "@/lib/api"
import { getTlsMenuLabel } from "@/lib/tls"
import { getPublicAppUrl } from "@/lib/apps"
import type { AppResource } from "@/lib/types"

export function AppDetailsPage() {
  const { appId = "" } = useParams()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const app = useApi<AppResource>(`/api/v1/app/${appId}`, {
    pollInterval: 1000,
  })
  const domainRequest = useApi<{ domain: string }>("/api/v1/ddns/domain")

  if (app.status === "loading") return <DetailsSkeleton />
  if (app.status === "error") {
    return <ErrorState message={app.error} onRetry={app.reload} />
  }

  const resource = app.data
  const domain =
    domainRequest.status === "success" ? domainRequest.data.domain : null
  const publicUrl = getPublicAppUrl(resource, domain)
  const state = resource.containerState || resource.state

  async function deleteApp() {
    if (!window.confirm(`Delete ${resource.name || "this app"}? This also removes its container.`)) return

    setDeleting(true)
    setDeleteError(null)
    try {
      await apiRequest(`/api/v1/app/${resource.id}`, { method: "DELETE" })
      navigate("/apps", { replace: true })
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Delete failed.")
      setDeleting(false)
    }
  }

  return (
    <section>
      <Link
        to="/apps"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Apps
      </Link>

      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div className="flex min-w-0 items-center gap-4">
          <AppLogo
            appId={resource.id}
            alt={`${resource.name || "App"} logo`}
            className="size-14"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {resource.name || "Unnamed app"}
              </h1>
              <StatusBadge state={state} />
            </div>
            {publicUrl && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                <span className="truncate">{publicUrl}</span>
                <ArrowUpRight className="size-3.5 shrink-0" />
              </a>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <ResourceActions
              id={resource.id}
              kind="app"
              state={state}
              recreate
              onComplete={app.reload}
            />
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void deleteApp()}
            >
              {deleting ? (
                <LoaderCircle className="mr-2 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 size-4" />
              )}
              Delete
            </Button>
          </div>
          {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="size-4 text-muted-foreground" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <Detail label="Subdomain" value={resource.subdomain || "—"} />
            <Detail label="TLS" value={getTlsMenuLabel(resource.tls)} />
            <Detail label="Container port" value={resource.port ?? "—"} mono />
            <Detail label="Privileged" value={resource.dockerPrivileged ? "Yes" : "No"} />
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4 text-muted-foreground" />
              Runtime
            </CardTitle>
          </CardHeader>
          <CardContent className="mt-5 space-y-5">
            <Detail label="State" value={state || "Unknown"} />
            <Detail
              label="Container ID"
              value={resource.containerId || "Not created"}
              to={resource.containerId ? `/containers/${resource.containerId}` : undefined}
              mono
            />
            <Detail label="Internal URL" value={resource.url || "—"} mono />
            <Detail label="Image" value={resource.dockerImage} mono />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4">
        <ListCard
          title="Environment"
          icon={Box}
          items={Object.entries(resource.dockerEnvironment).map(
            ([key, value]) => `${key}=${value}`
          )}
          empty="No environment variables configured."
        />
        <ListCard
          title="Volumes"
          icon={Network}
          items={resource.dockerVolumes}
          empty="No volumes configured."
        />
      </div>
    </section>
  )
}

function Detail({
  label,
  mono = false,
  to,
  value,
}: {
  label: string
  mono?: boolean
  to?: string
  value: string | number
}) {
  const valueClassName = `mt-1 break-words text-sm ${
    mono ? "font-mono text-xs" : "font-medium"
  }`

  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {to ? (
        <Link
          to={to}
          className={`${valueClassName} inline-block underline-offset-4 hover:underline`}
        >
          {value}
        </Link>
      ) : (
        <p className={valueClassName}>{value}</p>
      )}
    </div>
  )
}

function ListCard({
  empty,
  icon: Icon,
  items,
  title,
}: {
  empty: string
  icon: typeof Box
  items: string[]
  title: string
}) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="mt-5">
        {items.length > 0 ? (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item}
                className="rounded-lg bg-muted/50 px-3 py-2 font-mono text-xs"
              >
                {item}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </CardContent>
    </Card>
  )
}

function DetailsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-20" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
