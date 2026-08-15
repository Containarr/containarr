import { useEffect, useState } from "react"
import { Check, CircleAlert, Download, RefreshCw } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { ErrorState } from "@/components/resource-states"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cacheApiResponse, useApi } from "@/hooks/use-api"
import { apiRequest } from "@/lib/api"
import type { ContainarrUpdateStatus } from "@/lib/types"

export function UpdatesPage() {
  const update = useApi<ContainarrUpdateStatus>("/api/v1/update", {
    pollInterval: 1000 * 60 * 60,
  })
  const [checking, setChecking] = useState(false)
  const [checkedStatus, setCheckedStatus] = useState<ContainarrUpdateStatus | null>(null)

  const checkedAt = update.status === "success" ? update.data.checkedAt : null
  useEffect(() => setCheckedStatus(null), [checkedAt])

  if (update.status === "loading") {
    return (
      <section>
        <PageHeader title="Updates" description="New is always better! It's my oldest rule." />
        <Skeleton className="mt-8 h-64 w-full max-w-3xl rounded-xl" />
      </section>
    )
  }

  if (update.status === "error") {
    return <ErrorState message={update.error} onRetry={update.reload} />
  }

  const currentStatus = update.data

  async function checkForUpdates() {
    setChecking(true)
    try {
      const status = await apiRequest<ContainarrUpdateStatus>("/api/v1/update/check", {
        method: "POST",
      })
      cacheApiResponse("/api/v1/update", status)
      setCheckedStatus(status)
    } catch (error) {
      setCheckedStatus({
        ...currentStatus,
        error: error instanceof Error ? error.message : "Unable to check for updates.",
      })
    } finally {
      setChecking(false)
    }
  }

  const status = checkedStatus ?? currentStatus

  return (
    <section>
      <PageHeader title="Updates" description="New is always better! It's my oldest rule." />

      <Card className="mt-8 max-w-3xl shadow-none">
        <CardContent className="space-y-6 pt-6">
          {status.error ? (
            <div className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-red-800 dark:text-red-300">
              <CircleAlert className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-medium">Unable to check for updates</p>
                <p className="mt-1 text-sm opacity-80">{status.error}</p>
              </div>
            </div>
          ) : status.updateAvailable ? (
            <div className="flex items-start gap-3 rounded-xl border border-blue-500/25 bg-blue-500/10 p-4 text-blue-900 dark:text-blue-200">
              <Download className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-medium">A Containarr update is available</p>
                <p className="mt-1 text-sm opacity-80">
                  Version {status.latestVersion} is ready to install.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-300">
              <Check className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-medium">Containarr is up to date</p>
                <p className="mt-1 text-sm opacity-80">
                  You are running the latest available version.
                </p>
              </div>
            </div>
          )}

          <dl className="grid gap-5 border-t pt-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Current version</dt>
              <dd className="mt-1 font-mono text-sm">{status.currentVersion}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Latest version</dt>
              <dd className="mt-1 font-mono text-sm">
                {status.latestVersion ?? "Unavailable"}
              </dd>
            </div>
          </dl>

          <div className="flex justify-end border-t pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => void checkForUpdates()}
              disabled={checking}
            >
              <RefreshCw className={`mr-2 size-4 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Checking for Updates…" : "Check for Updates"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
