import { useState } from "react"
import {
  ArrowLeft,
  ArrowUpRight,
  LoaderCircle,
  Pencil,
  Settings2,
  Trash2,
  Waypoints,
} from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { ProxyDialog } from "@/components/new-proxy-dialog"
import { CertificateDetail } from "@/components/certificate-badge"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { ErrorState } from "@/components/resource-states"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"
import { apiRequest } from "@/lib/api"
import { getPublicProxyUrl } from "@/lib/proxies"
import { getTlsMenuLabel } from "@/lib/tls"
import type { ProxyResource } from "@/lib/types"

export function ProxyDetailsPage() {
  const { proxyId = "" } = useParams()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const proxy = useApi<ProxyResource>(`/api/v1/proxy/${proxyId}`, {
    pollInterval: 1000,
  })
  const domainRequest = useApi<{ domain: string }>("/api/v1/ddns/domain")

  if (proxy.status === "loading") return <DetailsSkeleton />
  if (proxy.status === "error") {
    return <ErrorState message={proxy.error} onRetry={proxy.reload} />
  }

  const resource = proxy.data
  const domain =
    domainRequest.status === "success" ? domainRequest.data.domain : null
  const publicUrl = getPublicProxyUrl(resource, domain)

  async function deleteProxy() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await apiRequest(`/api/v1/proxy/${resource.id}`, { method: "DELETE" })
      navigate("/proxies", { replace: true })
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Delete failed.")
      setDeleting(false)
    }
  }

  return (
    <section>
      <Link
        to="/proxies"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Proxies
      </Link>

      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border bg-muted/30">
            <Waypoints className="size-6 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {resource.subdomain}
            </h1>
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

      <Card className="mt-6 shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="size-4 text-muted-foreground" />
            Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <Detail label="Subdomain" value={resource.subdomain} mono />
          <Detail label="TLS" value={getTlsMenuLabel(resource.tls)} />
          <CertificateDetail
            certificate={resource.certificate}
            onRetry={async () => {
              await apiRequest(`/api/v1/proxy/${resource.id}/certificate/retry`, {
                method: "POST",
              })
              proxy.reload()
            }}
          />
          <Detail label="Source URL" value={resource.sourceUrl} href={resource.sourceUrl} mono />
          {publicUrl && (
            <Detail label="Public URL" value={publicUrl} href={publicUrl} mono />
          )}
        </CardContent>
      </Card>

      <ProxyDialog
        open={editing}
        proxy={resource}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false)
          proxy.reload()
        }}
      />
      <DeleteConfirmDialog
        open={confirmingDelete}
        title={`Delete ${resource.subdomain} proxy?`}
        description="This removes the reverse proxy rule. This action cannot be undone."
        deleting={deleting}
        error={deleteError}
        onCancel={() => {
          setConfirmingDelete(false)
          setDeleteError(null)
        }}
        onConfirm={() => void deleteProxy()}
      />
    </section>
  )
}

function Detail({
  href,
  label,
  mono = false,
  value,
}: {
  href?: string
  label: string
  mono?: boolean
  value: string
}) {
  const className = `mt-1 break-all text-sm ${
    mono ? "font-mono text-xs" : "font-medium"
  }`
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={`${className} inline-flex items-center gap-1 underline-offset-4 hover:underline`}
        >
          {value}
          <ArrowUpRight className="size-3 shrink-0" />
        </a>
      ) : (
        <p className={className}>{value}</p>
      )}
    </div>
  )
}

function DetailsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-20" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-72" />
        </div>
      </div>
      <Skeleton className="h-52 w-full rounded-xl" />
    </div>
  )
}
