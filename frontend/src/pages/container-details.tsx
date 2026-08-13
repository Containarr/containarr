import { useState } from "react"
import {
  ArrowLeft,
  Box,
  Cpu,
  Database,
  HardDrive,
  Link2,
  LoaderCircle,
  Network,
  Settings2,
  Tag,
  Trash2,
} from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { AppLogo } from "@/components/app-logo"
import { ContainerAvatar } from "@/components/container-avatar"
import { MetricChart } from "@/components/metric-chart"
import { ErrorState } from "@/components/resource-states"
import { ResourceActions } from "@/components/resource-actions"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"
import { apiRequest } from "@/lib/api"
import { getContainerAppId } from "@/lib/container-labels"
import type { AppResource, ContainerDetails } from "@/lib/types"

const metrics = [
  {
    title: "CPU",
    value: "18.4%",
    icon: Cpu,
    color: "bg-sky-500",
    data: [18, 24, 35, 28, 52, 46, 38, 65, 54, 42, 48, 36],
  },
  {
    title: "Memory",
    value: "824 MB",
    icon: Database,
    color: "bg-violet-500",
    data: [42, 45, 44, 48, 52, 56, 54, 61, 64, 62, 68, 66],
  },
  {
    title: "Disk",
    value: "12.8 GB",
    icon: HardDrive,
    color: "bg-amber-500",
    data: [26, 27, 28, 32, 34, 35, 38, 39, 42, 43, 45, 47],
  },
  {
    title: "Network",
    value: "4.2 MB/s",
    icon: Network,
    color: "bg-emerald-500",
    data: [12, 38, 22, 64, 48, 72, 35, 58, 82, 46, 68, 54],
  },
]

export function ContainerDetailsPage() {
  const { containerId = "" } = useParams()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const container = useApi<ContainerDetails>(`/api/v1/container/${containerId}`, {
    pollInterval: 1000,
  })
  const apps = useApi<Record<string, AppResource>>("/api/v1/app", {
    pollInterval: 1000,
  })

  if (container.status === "loading") return <DetailsSkeleton />
  if (container.status === "error") {
    return <ErrorState message={container.error} onRetry={container.reload} />
  }

  const resource = container.data
  const appId = getContainerAppId(resource)
  const linkedApp =
    appId && apps.status === "success" ? apps.data[appId] : null

  async function deleteContainer() {
    if (
      !window.confirm(
        `Delete ${resource.name || "this container"}? This cannot be undone.`
      )
    ) {
      return
    }

    setDeleting(true)
    setDeleteError(null)
    try {
      await apiRequest(`/api/v1/container/${resource.id}`, { method: "DELETE" })
      navigate("/containers", { replace: true })
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Delete failed.")
      setDeleting(false)
    }
  }

  return (
    <section>
      <Link
        to="/containers"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Containers
      </Link>

      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div className="flex min-w-0 items-center gap-4">
          <ContainerAvatar
            image={resource.image}
            alt=""
            className="size-14"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {resource.name || "Unnamed container"}
              </h1>
              <StatusBadge state={resource.state} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatRuntimeStatus(resource)}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <ResourceActions
              id={resource.id}
              kind="container"
              state={resource.state}
              onComplete={container.reload}
            />
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void deleteContainer()}
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

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricChart key={metric.title} {...metric} />
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="size-4 text-muted-foreground" />
              Container details
            </CardTitle>
          </CardHeader>
          <CardContent className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <Detail label="Image" value={resource.image} mono />
            <Detail label="Platform" value={resource.platform || "—"} />
            <Detail label="Created" value={formatDate(resource.created)} />
            <Detail label="Restart count" value={resource.restartCount} />
            <Detail label="Network mode" value={resource.networkMode} />
            <Detail label="Privileged" value={resource.privileged ? "Yes" : "No"} />
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="size-4 text-muted-foreground" />
              Managed by
            </CardTitle>
          </CardHeader>
          <CardContent className="mt-5">
            {appId ? (
              <Link
                to={`/apps/${appId}`}
                className="flex items-center gap-3 rounded-lg border bg-muted/25 p-3 hover:bg-muted/50"
              >
                <AppLogo
                  appId={appId}
                  alt={`${linkedApp?.name || "App"} logo`}
                  className="size-10"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {linkedApp?.name || "Containarr app"}
                  </p>
                  <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                    {appId}
                  </p>
                </div>
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">
                This container is not managed by an app.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ValueList
          title="Mounts"
          icon={HardDrive}
          items={resource.mounts
            .map(
              (mount) =>
                `${mount.Source} → ${mount.Destination}${mount.RW ? "" : " (read-only)"}`
            )
            .sort((left, right) => left.localeCompare(right))}
          empty="No mounts configured."
        />
        <ValueList
          title="Environment"
          icon={Box}
          items={resource.environment}
          empty="No environment variables configured."
        />
        <ValueList
          title="Labels"
          icon={Tag}
          items={Object.entries(resource.labels)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => `${key}=${value}`)}
          empty="No labels configured."
        />
      </div>
    </section>
  )
}

function Detail({
  label,
  mono = false,
  value,
}: {
  label: string
  mono?: boolean
  value: string | number
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 break-words text-sm ${mono ? "font-mono text-xs" : "font-medium"}`}>
        {value}
      </p>
    </div>
  )
}

function ValueList({
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
        {items.length ? (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item}
                className="break-all rounded-lg bg-muted/50 px-3 py-2 font-mono text-xs"
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
      <Skeleton className="h-5 w-24" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

function formatDate(value: string) {
  if (!value) return "—"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatRuntimeStatus(resource: ContainerDetails) {
  const state = resource.state.toLowerCase()

  if (state === "running") {
    const elapsed = elapsedSince(resource.startedAt)
    return elapsed ? `Running for ${elapsed}` : "Running"
  }

  if (["exited", "stopped", "dead"].includes(state)) {
    const elapsed = elapsedSince(resource.finishedAt)
    const label = state.charAt(0).toUpperCase() + state.slice(1)
    return elapsed ? `${label} ${elapsed} ago` : label
  }

  return state.charAt(0).toUpperCase() + state.slice(1)
}

function elapsedSince(value: string) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp) || timestamp < Date.UTC(2000, 0, 1)) return null

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return "less than a minute"

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"}`

  const days = Math.floor(hours / 24)
  return `${days} ${days === 1 ? "day" : "days"}`
}
