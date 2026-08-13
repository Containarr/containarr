import { useState } from "react"
import {
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  ShieldMinus,
  TriangleAlert,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { CertificateStatus } from "@/lib/types"

export function CertificateBadge({
  certificate,
}: {
  certificate: CertificateStatus
}) {
  const status = certificate.status
  const pending = status === "provisioning" || status === "renewing"
  const Icon =
    status === "ready"
      ? ShieldCheck
      : status === "error"
        ? TriangleAlert
        : status === "not_required"
          ? ShieldMinus
          : LoaderCircle
  const label =
    status === "ready"
      ? "Ready"
      : status === "error"
        ? "Error"
        : status === "not_required"
          ? "Not required"
          : status === "renewing"
            ? "Renewing…"
            : "Provisioning…"

  return (
    <Badge
      variant="outline"
      title={certificate.error || undefined}
      className={
        status === "ready"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
          : status === "error"
            ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
            : pending
              ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
              : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
      }
    >
      <Icon className={`size-3 ${pending ? "animate-spin" : ""}`} />
      <span className="relative -top-px">{label}</span>
    </Badge>
  )
}

export function CertificateDetail({
  certificate,
  onRetry,
}: {
  certificate: CertificateStatus
  onRetry?: () => Promise<void>
}) {
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  async function retry() {
    if (!onRetry) return
    setRetrying(true)
    setRetryError(null)
    try {
      await onRetry()
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "Retry failed.")
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">Certificate</p>
      <div className="mt-1.5">
        <CertificateBadge certificate={certificate} />
      </div>
      {certificate.status === "error" && certificate.error && (
        <p className="mt-1.5 break-words text-xs text-red-600 dark:text-red-400">
          {certificate.error}
        </p>
      )}
      {certificate.status === "error" && onRetry && (
        <Button
          type="button"
          variant="outline"
          className="mt-2 h-8 px-2.5"
          disabled={retrying}
          onClick={() => void retry()}
        >
          {retrying ? (
            <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <RotateCcw className="mr-1.5 size-3.5" />
          )}
          Retry
        </Button>
      )}
      {retryError && (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
          {retryError}
        </p>
      )}
      {certificate.expiresAt && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Auto-renews before {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
            new Date(certificate.expiresAt)
          )}
        </p>
      )}
    </div>
  )
}
