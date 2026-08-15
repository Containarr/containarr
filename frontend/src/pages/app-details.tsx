import { useEffect, useState } from "react"
import {
  ArrowLeft,
  ArrowUpRight,
  Box,
  Container,
  Download,
  LoaderCircle,
  Network,
  Pencil,
  RefreshCw,
  RotateCcw,
  Settings2,
  Trash2,
  X,
} from "lucide-react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"

import { AppLogo } from "@/components/app-logo"
import { CertificateDetail } from "@/components/certificate-badge"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { EditAppDialog } from "@/components/install-app-dialog"
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
import type { AppResource, PolicyResource } from "@/lib/types"

export function AppDetailsPage() {
  const { appId = "" } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [editing, setEditing] = useState(false)
  const [recreatePrompt, setRecreatePrompt] = useState<AppResource | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const app = useApi<AppResource>(`/api/v1/app/${appId}`, {
    pollInterval: 1000,
  })
  const domainRequest = useApi<{ domain: string }>("/api/v1/ddns/domain")
  const policies = useApi<Record<string, PolicyResource>>("/api/v1/firewall/policy")

  useEffect(() => {
    if (searchParams.get("policyId")) setEditing(true)
  }, [searchParams])

  if (app.status === "loading") return <DetailsSkeleton />
  if (app.status === "error") {
    return <ErrorState message={app.error} onRetry={app.reload} />
  }

  const resource = app.data
  const domain =
    domainRequest.status === "success" ? domainRequest.data.domain : null
  const publicUrl = getPublicAppUrl(resource, domain)
  const state = resource.containerState || resource.state
  const live = state.toLowerCase() === "running"

  async function deleteApp() {
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
              <StatusBadge state={state} label={live ? "Live" : undefined} />
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
              restartRecreates
              onComplete={app.reload}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(true)}
            >
              <Pencil className="mr-2 size-4" />
              Edit
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
            <Detail
              label="Firewall policy"
              value={
                policies.status === "success"
                  ? policies.data[resource.policyId]?.name ?? "Unknown"
                  : "…"
              }
            />
            <CertificateDetail
              certificate={resource.certificate}
              onRetry={async () => {
                await apiRequest(`/api/v1/app/${resource.id}/certificate/retry`, {
                  method: "POST",
                })
                app.reload()
              }}
            />
            <Detail label="Container port" value={resource.port ?? "—"} mono />
            <Detail
              label="Network"
              value={resource.dockerNetworkMode === "host" ? "Host" : "Bridge"}
            />
            <Detail label="Privileged" value={resource.dockerPrivileged ? "Yes" : "No"} />
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Container className="size-4 text-muted-foreground" />
              Container
            </CardTitle>
          </CardHeader>
          <CardContent className="mt-5 space-y-5">
            <Detail label="State" value={live ? "Live" : state || "Unknown"} />
            <Detail
              label="Container ID"
              value={resource.containerId || "Not created"}
              to={resource.containerId ? `/containers/${resource.containerId}` : undefined}
              mono
            />
            <Detail label="Internal URL" value={resource.url || "—"} mono />
            <Detail label="Image" value={resource.dockerImage} mono />
            <ImageUpdateControls app={resource} onReload={app.reload} />
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

      <EditAppDialog
        open={editing}
        app={{
          ...resource,
          policyId: searchParams.get("policyId") ?? resource.policyId,
        }}
        onClose={() => {
          setEditing(false)
          if (searchParams.has("policyId")) setSearchParams({}, { replace: true })
        }}
        onSaved={(saved, dockerPropertiesChanged) => {
          setEditing(false)
          if (searchParams.has("policyId")) setSearchParams({}, { replace: true })
          app.reload()
          if (
            dockerPropertiesChanged &&
            (saved.containerState || saved.state).toLowerCase() === "running"
          ) {
            setRecreatePrompt(saved)
          }
        }}
      />
      {recreatePrompt && (
        <RecreateAppDialog
          app={recreatePrompt}
          onClose={() => setRecreatePrompt(null)}
          onComplete={() => {
            setRecreatePrompt(null)
            app.reload()
          }}
        />
      )}
      <DeleteConfirmDialog
        open={confirmingDelete}
        title={`Delete ${resource.name || "app"}?`}
        description="This also removes its container. This action cannot be undone."
        deleting={deleting}
        error={deleteError}
        onCancel={() => {
          setConfirmingDelete(false)
          setDeleteError(null)
        }}
        onConfirm={() => void deleteApp()}
      />
    </section>
  )
}

function ImageUpdateControls({
  app,
  onReload,
}: {
  app: AppResource
  onReload: () => void
}) {
  const [autoUpdate, setAutoUpdate] = useState(app.autoUpdate)
  const [pending, setPending] = useState<"setting" | "checking" | "updating" | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setAutoUpdate(app.autoUpdate), [app.autoUpdate])

  async function changeAutoUpdate(enabled: boolean) {
    setAutoUpdate(enabled)
    setPending("setting")
    setError(null)
    try {
      await apiRequest(`/api/v1/app/${app.id}/auto-update`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      })
      onReload()
    } catch (requestError) {
      setAutoUpdate(!enabled)
      setError(getRequestError(requestError))
    } finally {
      setPending(null)
    }
  }

  async function checkForUpdates(apply = false) {
    setPending(apply ? "updating" : "checking")
    setError(null)
    try {
      await apiRequest(
        `/api/v1/app/${app.id}/update/${apply ? "apply" : "check"}`,
        { method: "POST" }
      )
      onReload()
    } catch (requestError) {
      setError(getRequestError(requestError))
    } finally {
      setPending(null)
    }
  }

  const status = pending === "checking"
    ? "Checking for updates…"
    : pending === "updating"
      ? "Updating app…"
      : getImageUpdateStatus(app)

  return (
    <div className="border-t pt-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={autoUpdate}
            disabled={pending !== null}
            onChange={(event) => void changeAutoUpdate(event.target.checked)}
            className="mt-0.5 size-4 rounded border"
          />
          <span>
            <span className="block text-sm font-medium">Auto-update</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Recreate this app automatically when its image changes.
            </span>
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          {app.imageUpdate.status === "available" && !app.autoUpdate && (
            <Button
              type="button"
              onClick={() => void checkForUpdates(true)}
              disabled={pending !== null}
              className="h-8"
            >
              <Download className="mr-1.5 size-3.5" />
              Update now
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => void checkForUpdates()}
            disabled={pending !== null}
            className="h-8"
          >
            <RefreshCw
              className={`mr-1.5 size-3.5 ${pending === "checking" ? "animate-spin" : ""}`}
            />
            Check for Updates
          </Button>
        </div>
      </div>
      <p
        className={`mt-3 text-xs ${
          error || app.imageUpdate.status === "error"
            ? "text-red-600 dark:text-red-400"
            : "text-muted-foreground"
        }`}
      >
        {error || status}
      </p>
    </div>
  )
}

function getImageUpdateStatus(app: AppResource) {
  const update = app.imageUpdate
  if (update.status === "checking") return "Checking for updates…"
  if (update.status === "updating") return "Updating app…"
  if (update.status === "available") return "An image update is available."
  if (update.status === "error") return update.error || "Update check failed."
  if (update.status === "not_checked") return "Not checked yet."

  const checkedAt = update.checkedAt
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(update.checkedAt))
    : null
  return checkedAt ? `Up to date. Checked ${checkedAt}.` : "Up to date."
}

function getRequestError(error: unknown) {
  return error instanceof Error ? error.message : "Request failed."
}

function RecreateAppDialog({
  app,
  onClose,
  onComplete,
}: {
  app: AppResource
  onClose: () => void
  onComplete: () => void
}) {
  const [recreating, setRecreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !recreating) onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose, recreating])

  async function recreate() {
    setRecreating(true)
    setError(null)
    try {
      await apiRequest(`/api/v1/app/${app.id}/recreate`, { method: "POST" })
      onComplete()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The app could not be recreated."
      )
      setRecreating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !recreating) onClose()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="recreate-app-title"
        aria-describedby="recreate-app-description"
        className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="recreate-app-title" className="text-lg font-semibold">
              Restart {app.name || "app"}?
            </h2>
            <p
              id="recreate-app-description"
              className="mt-2 text-sm leading-relaxed text-muted-foreground"
            >
              The Docker settings were saved. Restart the app now to apply them?
              The container will be recreated and the app will be unavailable
              briefly.
            </p>
          </div>
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            disabled={recreating}
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={recreating}
          >
            Not now
          </Button>
          <Button
            type="button"
            onClick={() => void recreate()}
            disabled={recreating}
          >
            {recreating ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 size-4" />
            )}
            Restart
          </Button>
        </div>
      </div>
    </div>
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
