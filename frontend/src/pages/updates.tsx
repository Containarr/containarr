import { Check, CircleAlert, Download } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { ErrorState } from "@/components/resource-states"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"
import type { ContainarrUpdateStatus } from "@/lib/types"

export function UpdatesPage() {
  const update = useApi<ContainarrUpdateStatus>("/api/v1/update", {
    pollInterval: 1000 * 60 * 60,
  })

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

  return (
    <section>
      <PageHeader title="Updates" description="New is always better! It's my oldest rule." />

      <Card className="mt-8 max-w-3xl shadow-none">
        <CardContent className="space-y-6 pt-6">
          {update.data.error ? (
            <div className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-red-800 dark:text-red-300">
              <CircleAlert className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-medium">Unable to check for updates</p>
                <p className="mt-1 text-sm opacity-80">{update.data.error}</p>
              </div>
            </div>
          ) : update.data.updateAvailable ? (
            <div className="flex items-start gap-3 rounded-xl border border-blue-500/25 bg-blue-500/10 p-4 text-blue-900 dark:text-blue-200">
              <Download className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-medium">A Containarr update is available</p>
                <p className="mt-1 text-sm opacity-80">
                  Version {update.data.latestVersion} is ready to install.
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
              <dd className="mt-1 font-mono text-sm">{update.data.currentVersion}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Latest version</dt>
              <dd className="mt-1 font-mono text-sm">
                {update.data.latestVersion ?? "Unavailable"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </section>
  )
}
