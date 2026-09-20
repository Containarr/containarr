import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, LoaderCircle, RefreshCw, Trash2 } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { apiRequest } from "@/lib/api"

type TrafficLog = {
  requests: {
    id: number
    startedAt: string
    method: string
    host: string
    path: string
    clientIp: string
    status: number
    durationMs: number
    bytes: number
  }[]
  total: number
  page: number
  pageSize: number
}

export function TrafficPage() {
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<TrafficLog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clearError, setClearError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    if (clearing) return
    const controller = new AbortController()
    let timer: number | undefined
    setData(null)
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const result = await apiRequest<TrafficLog>(`/api/v1/traffic?page=${page}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize))
        if (page > lastPage) { setPage(lastPage); return }
        setData(result)
        setError(null)
      } catch (requestError) {
        if (controller.signal.aborted) return
        setError(requestError instanceof Error ? requestError.message : "Could not load traffic logs.")
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          if (page === 1) timer = window.setTimeout(() => void load(), 5000)
        }
      }
    }

    void load()
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [page, revision, clearing])

  async function clearLogs() {
    if (clearing) return
    setClearing(true)
    setClearError(null)
    try {
      await apiRequest("/api/v1/traffic", { method: "DELETE" })
      setData(null)
      setPage(1)
    } catch (requestError) {
      setClearError(requestError instanceof Error ? requestError.message : "Could not clear traffic logs.")
    } finally {
      setClearing(false)
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Traffic" description="HTTP requests handled by Traefik. The latest 100,000 requests are kept." />
        <Button variant="outline" disabled={clearing || loading || !data?.total} onClick={() => void clearLogs()}>
          {clearing ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
          {clearing ? "Clearing…" : "Clear Logs"}
        </Button>
      </div>

      {clearError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{clearError}</p>}
      {error && <div role="alert" className="flex items-center gap-3 text-sm text-red-600 dark:text-red-400">
        <span>{error}</span><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Retry</Button>
      </div>}

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 text-xs text-muted-foreground">
          <span>{data ? `${data.total.toLocaleString()} requests` : "Traffic logs"} · Newest first</span>
          <div className="flex items-center gap-3">
            <span>{page === 1 ? "Refreshes every 5 seconds" : "Live refresh paused"}</span>
            <Button variant="ghost" disabled={loading || clearing} aria-label="Refresh traffic logs" onClick={() => setRevision(value => value + 1)}>
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground"><tr>
              {["Date & time", "Method", "Host / Path", "Client IP", "Status", "Duration", "Size"].map(label => (
                <th key={label} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y">
              {loading || clearing ? <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">{clearing ? "Clearing logs…" : "Loading traffic…"}</td></tr>
                : data?.requests.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No traffic logs yet. New requests will appear here automatically.</td></tr>
                : data?.requests.map(request => <tr key={request.id} className="hover:bg-muted/25">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground"><time dateTime={request.startedAt}>{new Date(request.startedAt).toLocaleString()}</time></td>
                  <td className="px-4 py-3 font-mono text-xs font-medium">{request.method}</td>
                  <td className="min-w-48 max-w-96 px-4 py-3">
                    <div className="truncate font-medium" title={request.host}>{request.host || "—"}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground" title={request.path}>{request.path || "/"}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">{request.clientIp || "—"}</td>
                  <td className="px-4 py-3"><span className={`rounded-md px-2 py-1 font-mono text-xs font-medium ${request.status >= 500 ? "bg-red-500/10 text-red-600 dark:text-red-400" : request.status >= 400 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : request.status >= 300 ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : request.status >= 200 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{request.status || "—"}</span></td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-muted-foreground">{request.durationMs.toLocaleString(undefined, { maximumFractionDigits: 1 })} ms</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-muted-foreground">{request.bytes >= 1_048_576 ? `${(request.bytes / 1_048_576).toFixed(1)} MB` : request.bytes >= 1024 ? `${(request.bytes / 1024).toFixed(1)} KB` : `${request.bytes} B`}</td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {data && data.total > data.pageSize && <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
        <span>Page {page} of {Math.ceil(data.total / data.pageSize).toLocaleString()}</span>
        <Button variant="outline" disabled={page === 1 || loading || clearing} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
        <Button variant="outline" disabled={page * data.pageSize >= data.total || loading || clearing} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
      </div>}
    </section>
  )
}
