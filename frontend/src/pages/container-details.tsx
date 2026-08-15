import { useEffect, useRef, useState } from "react"
import Ansi from "ansi-to-react"
import {
  ArrowLeft,
  ArrowUpRight,
  Box,
  Cpu,
  Database,
  HardDrive,
  LayoutGrid,
  LoaderCircle,
  Network,
  Settings2,
  Tag,
  Terminal,
  Trash2,
} from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { AppLogo } from "@/components/app-logo"
import { ContainerAvatar } from "@/components/container-avatar"
import { ContainerShellDialog } from "@/components/container-shell-dialog"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { MetricChart, type MetricPoint } from "@/components/metric-chart"
import { ErrorState } from "@/components/resource-states"
import { ResourceActions } from "@/components/resource-actions"
import {
  SortableTableHeader,
  type SortDirection,
} from "@/components/sortable-table-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"
import { apiRequest } from "@/lib/api"
import { getPublicAppUrl } from "@/lib/apps"
import { getContainerAppId } from "@/lib/container-labels"
import type { AppResource, ContainerDetails, ContainerStats } from "@/lib/types"

export function ContainerDetailsPage() {
  const { containerId = "" } = useParams()
  const navigate = useNavigate()
  const [shellOpen, setShellOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [metricHistory, setMetricHistory] = useState<MetricPoint[]>([])
  const previousStatsRef = useRef<ContainerStats | null>(null)
  const container = useApi<ContainerDetails>(`/api/v1/container/${containerId}`, {
    pollInterval: 1000,
  })
  const apps = useApi<Record<string, AppResource>>("/api/v1/app", {
    pollInterval: 1000,
  })
  const domain = useApi<{ domain: string }>("/api/v1/ddns/domain")
  const logs = useApi<{ logs: string }>(
    `/api/v1/container/${containerId}/logs?tail=200`,
    { pollInterval: 2000 }
  )
  const stats = useApi<ContainerStats>(
    `/api/v1/container/${containerId}/stats`,
    { pollInterval: 1000 }
  )

  useEffect(() => {
    if (stats.status !== "success") return

    const sample = stats.data
    const previous = previousStatsRef.current
    const timestamp = parseDockerTimestamp(sample.read)
    const sameContainer = previous?.id === sample.id
    const elapsedSeconds = sameContainer
      ? Math.max((timestamp - parseDockerTimestamp(previous.read)) / 1000, 0.001)
      : 1
    const point: MetricPoint = {
      timestamp,
      cpu: sample.cpuPercent,
      memory: sample.memoryUsage,
      diskRead: sameContainer
        ? bytesPerSecond(sample.blockReadBytes, previous.blockReadBytes, elapsedSeconds)
        : 0,
      diskWrite: sameContainer
        ? bytesPerSecond(sample.blockWriteBytes, previous.blockWriteBytes, elapsedSeconds)
        : 0,
      networkReceive: sameContainer
        ? bytesPerSecond(sample.networkRxBytes, previous.networkRxBytes, elapsedSeconds)
        : 0,
      networkTransmit: sameContainer
        ? bytesPerSecond(sample.networkTxBytes, previous.networkTxBytes, elapsedSeconds)
        : 0,
    }

    setMetricHistory((current) =>
      sameContainer ? [...current, point].slice(-60) : [point]
    )
    previousStatsRef.current = sample
  }, [stats.status, stats.data])

  if (container.status === "loading") return <DetailsSkeleton />
  if (container.status === "error") {
    return <ErrorState message={container.error} onRetry={container.reload} />
  }

  const resource = container.data
  const appId = getContainerAppId(resource)
  const linkedApp =
    appId && apps.status === "success" ? apps.data[appId] : null
  const publicUrl = linkedApp && domain.status === "success"
    ? getPublicAppUrl(linkedApp, domain.data.domain)
    : null
  const latestMetrics = metricHistory.at(-1)
  const latestStats = stats.status === "success" ? stats.data : null
  const metrics = [
    {
      title: "CPU",
      value: latestMetrics ? formatPercent(latestMetrics.cpu) : "—",
      icon: Cpu,
      data: metricHistory,
      domain: [0, 100] as [number, number],
      formatValue: formatPercent,
      series: [{ key: "cpu", label: "CPU", color: "var(--chart-1)" }],
    },
    {
      title: "Memory",
      value: latestStats
        ? `${formatBytes(latestStats.memoryUsage)} / ${formatBytes(latestStats.memoryLimit)}`
        : "—",
      icon: Database,
      data: metricHistory,
      domain: [0, Math.max(latestStats?.memoryLimit ?? 0, 1)] as [number, number],
      formatValue: formatBytes,
      series: [{ key: "memory", label: "Used", color: "var(--chart-2)" }],
    },
    {
      title: "Disk",
      value: latestMetrics
        ? formatRate(latestMetrics.diskRead + latestMetrics.diskWrite)
        : "—",
      icon: HardDrive,
      data: metricHistory,
      formatValue: formatRate,
      series: [
        { key: "diskRead", label: "Read", color: "var(--chart-3)" },
        { key: "diskWrite", label: "Write", color: "var(--chart-4)" },
      ],
    },
    {
      title: "Network",
      value: latestMetrics
        ? formatRate(latestMetrics.networkReceive + latestMetrics.networkTransmit)
        : "—",
      icon: Network,
      data: metricHistory,
      formatValue: formatRate,
      series: [
        { key: "networkReceive", label: "Receive", color: "var(--chart-5)" },
        { key: "networkTransmit", label: "Transmit", color: "var(--chart-6)" },
      ],
    },
  ]

  async function deleteContainer() {
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
              variant="outline"
              disabled={resource.state.toLowerCase() !== "running"}
              onClick={() => setShellOpen(true)}
            >
              <Terminal className="mr-2 size-4" />
              Shell
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                setDeleteError(null)
                setConfirmingDelete(true)
              }}
            >
              {deleting ? (
                <LoaderCircle className="mr-2 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 size-4" />
              )}
              Delete
            </Button>
          </div>
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
              Details
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
              <LayoutGrid className="size-4 text-muted-foreground" />
              App
            </CardTitle>
          </CardHeader>
          <CardContent className="mt-5">
            {appId ? (
              <div className="flex items-center gap-3 rounded-lg border bg-muted/25 p-3">
                <AppLogo
                  appId={appId}
                  alt={`${linkedApp?.name || "App"} logo`}
                  className="size-10"
                />
                <div className="min-w-0">
                  <Link
                    to={`/apps/${appId}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {linkedApp?.name || "Containarr app"}
                  </Link>
                  {publicUrl ? (
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 flex min-w-0 items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                    >
                      <span className="truncate">{publicUrl}</span>
                      <ArrowUpRight className="size-3 shrink-0" />
                    </a>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This container is not managed by an app.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4">
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
        <KeyValueTable
          title="Environment"
          icon={Box}
          rows={resource.environment.map(splitEnvironmentVariable)}
          empty="No environment variables configured."
        />
        <KeyValueTable
          title="Labels"
          icon={Tag}
          rows={Object.entries(resource.labels).map(([key, value]) => ({
            key,
            value,
          }))}
          empty="No labels configured."
        />
      </div>

      <ContainerLogs request={logs} />
      <ContainerShellDialog
        open={shellOpen}
        containerId={resource.id}
        containerName={resource.name || "Container"}
        onClose={() => setShellOpen(false)}
      />
      <DeleteConfirmDialog
        open={confirmingDelete}
        title={`Delete ${resource.name || "container"}?`}
        description="This permanently deletes the container. This action cannot be undone."
        deleting={deleting}
        error={deleteError}
        onCancel={() => {
          setConfirmingDelete(false)
          setDeleteError(null)
        }}
        onConfirm={() => void deleteContainer()}
      />
    </section>
  )
}

function ContainerLogs({
  request,
}: {
  request: ReturnType<typeof useApi<{ logs: string }>>
}) {
  const viewerRef = useRef<HTMLPreElement>(null)
  const followRef = useRef(true)
  const output = request.status === "success" ? request.data.logs : ""

  useEffect(() => {
    const viewer = viewerRef.current
    if (viewer && followRef.current) viewer.scrollTop = viewer.scrollHeight
  }, [output])

  function updateFollowState() {
    const viewer = viewerRef.current
    if (!viewer) return

    followRef.current =
      viewer.scrollHeight - viewer.scrollTop - viewer.clientHeight < 24
  }

  return (
    <Card className="mt-4 overflow-hidden shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Terminal className="size-4 text-muted-foreground" />
          Logs
        </CardTitle>
      </CardHeader>
      <CardContent className="mt-5">
        {request.status === "loading" ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : request.status === "error" ? (
          <div className="flex min-h-28 flex-col items-start justify-center gap-3 rounded-lg border border-dashed p-4">
            <p className="text-sm text-muted-foreground">{request.error}</p>
            <Button type="button" variant="outline" onClick={request.reload}>
              Try again
            </Button>
          </div>
        ) : output ? (
          <pre
            ref={viewerRef}
            onScroll={updateFollowState}
            className="max-h-[28rem] min-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-100"
          >
            <Ansi>{output}</Ansi>
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">
            This container has not written any logs yet.
          </p>
        )}
      </CardContent>
    </Card>
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

type KeyValueSort = {
  key: "key" | "value"
  direction: SortDirection
}

function KeyValueTable({
  empty,
  icon: Icon,
  rows,
  title,
}: {
  empty: string
  icon: typeof Box
  rows: Array<{ key: string; value: string }>
  title: string
}) {
  const [sort, setSort] = useState<KeyValueSort>({
    key: "key",
    direction: "asc",
  })
  const sortedRows = [...rows].sort((left, right) => {
    const comparison = left[sort.key].localeCompare(right[sort.key], undefined, {
      numeric: true,
      sensitivity: "base",
    })
    return sort.direction === "asc" ? comparison : -comparison
  })

  function changeSort(key: KeyValueSort["key"]) {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }))
  }

  return (
    <Card className="overflow-hidden shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      {sortedRows.length ? (
        <CardContent className="mt-5 px-0 pb-0">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-1/3" />
              <col />
            </colgroup>
            <thead className="border-y bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <SortableTableHeader
                  label="Key"
                  active={sort.key === "key"}
                  direction={sort.direction}
                  onClick={() => changeSort("key")}
                />
                <SortableTableHeader
                  label="Value"
                  active={sort.key === "value"}
                  direction={sort.direction}
                  onClick={() => changeSort("value")}
                />
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedRows.map((row, index) => (
                <tr key={`${row.key}-${index}`} className="hover:bg-muted/25">
                  <td className="break-all px-4 py-3 font-mono text-xs font-medium">
                    {row.key}
                  </td>
                  <td className="break-all px-4 py-3 font-mono text-xs text-muted-foreground">
                    {row.value || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      ) : (
        <CardContent className="mt-5">
          <p className="text-sm text-muted-foreground">{empty}</p>
        </CardContent>
      )}
    </Card>
  )
}

function splitEnvironmentVariable(variable: string) {
  const separator = variable.indexOf("=")
  return separator < 0
    ? { key: variable, value: "" }
    : {
        key: variable.slice(0, separator),
        value: variable.slice(separator + 1),
      }
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

function bytesPerSecond(current: number, previous: number, elapsedSeconds: number) {
  return Math.max(0, current - previous) / elapsedSeconds
}

function parseDockerTimestamp(value: string) {
  const timestamp = Date.parse(value.replace(/(\.\d{3})\d+/, "$1"))
  return Number.isFinite(timestamp) ? timestamp : Date.now()
}

function formatPercent(value: number) {
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`
}

function formatRate(value: number) {
  return `${formatBytes(value)}/s`
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1
  )
  const scaled = value / 1024 ** exponent
  return `${scaled.toFixed(scaled >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}
