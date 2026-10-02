import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Check, CircleAlert, Copy, DatabaseBackup, FileDown, LoaderCircle, TriangleAlert, X } from "lucide-react"
import { Link } from "react-router-dom"

import { AppLogo } from "@/components/app-logo"
import { PageHeader } from "@/components/page-header"
import { ErrorState } from "@/components/resource-states"
import { SortableTableHeader, type SortDirection } from "@/components/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip } from "@/components/ui/tooltip"
import { cacheApiResponse, useApi } from "@/hooks/use-api"
import { apiRequest } from "@/lib/api"
import type { BackupSettings } from "@/lib/types"

export function BackupsPage() {
  const settings = useApi<BackupSettings>("/api/v1/backup")
  const [repositoryUrl, setRepositoryUrl] = useState("")
  const [intervalHours, setIntervalHours] = useState("6")
  const [branch, setBranch] = useState("main")
  const [saving, setSaving] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [copied, setCopied] = useState(false)
  const [savedSettings, setSavedSettings] = useState<BackupSettings | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [excludingVolume, setExcludingVolume] = useState<string | null>(null)
  const [volumeError, setVolumeError] = useState<string | null>(null)
  const [volumeSort, setVolumeSort] = useState<{
    key: "app" | "volume" | "size"
    direction: SortDirection
  }>({ key: "app", direction: "asc" })
  const [volumeSizes, setVolumeSizes] = useState<Record<string, {
    pending: boolean
    size?: number
    error?: string
  }>>({})
  const requestedVolumeSizes = useRef(new Set<string>())

  useEffect(() => {
    if (settings.status !== "success") return
    setRepositoryUrl(settings.data.repositoryUrl)
    setBranch(settings.data.branch)
    setIntervalHours(String(settings.data.intervalHours))
  }, [settings.status, settings.status === "success" ? settings.data : null])

  const settingsForVolumeSizes = savedSettings ?? (settings.status === "success" ? settings.data : null)
  const sortedVolumes = useMemo(() => {
    if (!settingsForVolumeSizes) return []
    return [...settingsForVolumeSizes.volumes].sort((left, right) => {
      const leftValue = volumeSort.key === "app"
        ? left.appName
        : volumeSort.key === "volume"
          ? left.volume
          : volumeSizes[JSON.stringify([left.appId, left.volume])]?.size ?? -1
      const rightValue = volumeSort.key === "app"
        ? right.appName
        : volumeSort.key === "volume"
          ? right.volume
          : volumeSizes[JSON.stringify([right.appId, right.volume])]?.size ?? -1
      const comparison = String(leftValue).localeCompare(String(rightValue), undefined, {
        numeric: true,
        sensitivity: "base",
      })
      if (comparison !== 0) return volumeSort.direction === "asc" ? comparison : -comparison
      return left.appName.localeCompare(right.appName, undefined, { numeric: true, sensitivity: "base" })
        || left.volume.localeCompare(right.volume, undefined, { numeric: true, sensitivity: "base" })
    })
  }, [settingsForVolumeSizes, volumeSizes, volumeSort])
  useEffect(() => {
    if (!settingsForVolumeSizes) return
    for (const { appId, volume } of settingsForVolumeSizes.volumes) {
      const key = JSON.stringify([appId, volume])
      if (requestedVolumeSizes.current.has(key)) continue
      requestedVolumeSizes.current.add(key)
      setVolumeSizes((current) => ({ ...current, [key]: { pending: true } }))
      void apiRequest<{ size: number }>(`/api/v1/app/${encodeURIComponent(appId)}/volume/size`, {
        method: "POST",
        body: JSON.stringify({ volume }),
      }).then((result) => {
        setVolumeSizes((current) => ({ ...current, [key]: { pending: false, size: result.size } }))
      }).catch((error) => {
        setVolumeSizes((current) => ({
          ...current,
          [key]: {
            pending: false,
            error: error instanceof Error ? error.message : "Unable to calculate volume size.",
          },
        }))
      })
    }
  }, [settingsForVolumeSizes])

  if (settings.status === "loading") {
    return (
      <section>
        <PageHeader title="Backups" description="Keep a Git copy of your configuration and selected app data." />
        <Skeleton className="mt-8 h-96 w-full max-w-3xl rounded-xl" />
      </section>
    )
  }

  if (settings.status === "error") {
    return <ErrorState message={settings.error} onRetry={settings.reload} />
  }

  const currentSettings = savedSettings ?? settings.data
  const messageIsSuccess = message === "Backup pushed."
    || message === "Backup settings saved."

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const updated = await apiRequest<BackupSettings>("/api/v1/backup", {
        method: "PUT",
        body: JSON.stringify({ repositoryUrl, branch, intervalHours: Number(intervalHours) }),
      })
      cacheApiResponse("/api/v1/backup", updated)
      setSavedSettings(updated)
      setMessage("Backup settings saved.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Backup settings could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  async function backupNow() {
    setBackingUp(true)
    setMessage(null)
    try {
      const updated = await apiRequest<BackupSettings>("/api/v1/backup", {
        method: "POST",
      })
      cacheApiResponse("/api/v1/backup", updated)
      setSavedSettings(updated)
      setMessage("Backup pushed.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Backup failed.")
    } finally {
      setBackingUp(false)
    }
  }

  async function exclude(appId: string, volume: string) {
    const key = JSON.stringify([appId, volume])
    setExcludingVolume(key)
    setVolumeError(null)
    try {
      const updated = await apiRequest<BackupSettings>("/api/v1/backup/volume", {
        method: "DELETE",
        body: JSON.stringify({ appId, volume }),
      })
      cacheApiResponse("/api/v1/backup", updated)
      setSavedSettings(updated)
    } catch (error) {
      setVolumeError(error instanceof Error ? error.message : "Volume could not be excluded.")
    } finally {
      setExcludingVolume(null)
    }
  }

  function changeVolumeSort(key: "app" | "volume" | "size") {
    setVolumeSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }))
  }

  return (
    <section>
      <PageHeader
        title="Backups"
        description="Back up your configuration and selected app volumes to a private Git repository."
      />

      <div className="mt-8 max-w-3xl space-y-5">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DatabaseBackup className="size-4 text-muted-foreground" />
              Git Repository
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Create a private, empty Git repository with Git LFS support.</li>
              <li>Add the deploy key below with write access.</li>
              <li>Enter the repository&apos;s SSH URL and save.</li>
            </ol>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="backup-deploy-key" className="text-sm font-medium">Deploy Key</label>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    void navigator.clipboard.writeText(currentSettings.publicKey).then(() => {
                      setCopied(true)
                      window.setTimeout(() => setCopied(false), 1500)
                    })
                  }}
                >
                  {copied ? <Check className="mr-1.5 size-3.5" /> : <Copy className="mr-1.5 size-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <pre
                id="backup-deploy-key"
                className="mt-1.5 overflow-x-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap break-all"
              >
                {currentSettings.publicKey}
              </pre>
            </div>

            <form onSubmit={(event) => void save(event)} className="mt-6 space-y-5 border-t pt-6">
              <div>
                <label htmlFor="backup-repository" className="text-sm font-medium">Repository SSH URL</label>
                <Input
                  id="backup-repository"
                  required
                  value={repositoryUrl}
                  onChange={(event) => setRepositoryUrl(event.target.value)}
                  placeholder="git@github.com:yourname/containarr-backup.git"
                  className="mt-1.5 font-mono text-xs"
                />
              </div>
              <div>
                <label htmlFor="backup-branch" className="block text-sm font-medium">Branch</label>
                <Input
                  id="backup-branch"
                  required
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  className="mt-1.5 max-w-48 font-mono text-xs"
                />
              </div>

              <div>
                <label htmlFor="backup-interval" className="block text-sm font-medium">Interval</label>
                <div className="mt-1.5 flex max-w-48 overflow-hidden rounded-lg border bg-background shadow-xs focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-ring/30">
                  <Input
                    id="backup-interval"
                    type="number"
                    min="0"
                    max="8760"
                    step="1"
                    required
                    value={intervalHours}
                    onChange={(event) => setIntervalHours(event.target.value)}
                    aria-describedby="backup-interval-unit"
                    className="rounded-none border-0 shadow-none focus:ring-0"
                  />
                  <span id="backup-interval-unit" className="flex shrink-0 items-center border-l bg-muted/30 px-3 text-sm text-muted-foreground">
                    hours
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Set to 0 to disable scheduled backups.
                </p>
              </div>

              {currentSettings.error && (
                <div className="flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-red-800 dark:text-red-300">
                  <CircleAlert className="mt-0.5 size-5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium">Backup failed</p>
                    <p className="mt-1 break-words text-sm opacity-80">{currentSettings.error}</p>
                  </div>
                </div>
              )}

              {message && (
                <div className={`flex items-start gap-3 rounded-xl border p-4 ${messageIsSuccess ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-300"}`}>
                  {messageIsSuccess ? <Check className="mt-0.5 size-5 shrink-0" /> : <CircleAlert className="mt-0.5 size-5 shrink-0" />}
                  <p className="text-sm">{message}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-6">
                <p className="text-xs text-muted-foreground">
                  {currentSettings.lastBackupAt
                    ? `Last backed up ${new Date(currentSettings.lastBackupAt).toLocaleString()}`
                    : "No successful backup yet."}
                </p>
                <div className="flex gap-2">
                  {currentSettings.configured && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving || backingUp || currentSettings.backingUp}
                      onClick={() => void backupNow()}
                    >
                      {(backingUp || currentSettings.backingUp) && <LoaderCircle className="mr-2 size-4 animate-spin" />}
                      {backingUp || currentSettings.backingUp ? "Backing Up…" : "Back Up Now"}
                    </Button>
                  )}
                  <Button type="submit" disabled={saving || backingUp || currentSettings.backingUp}>
                    {saving && <LoaderCircle className="mr-2 size-4 animate-spin" />}
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DatabaseBackup className="size-4 text-muted-foreground" />
              Backed Up Volumes
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Select “Include in Backup” when adding or editing an app to add volumes here.
            </p>
            <p className="text-xs text-muted-foreground">
              Volume data is copied while apps are running, so stop an app before backing it up if it requires a consistent snapshot.
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            {currentSettings.volumes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No volumes are included in backups.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <SortableTableHeader
                        label="App"
                        active={volumeSort.key === "app"}
                        direction={volumeSort.direction}
                        onClick={() => changeVolumeSort("app")}
                      />
                      <SortableTableHeader
                        label="Volume"
                        active={volumeSort.key === "volume"}
                        direction={volumeSort.direction}
                        onClick={() => changeVolumeSort("volume")}
                      />
                      <SortableTableHeader
                        label="Size"
                        active={volumeSort.key === "size"}
                        direction={volumeSort.direction}
                        onClick={() => changeVolumeSort("size")}
                      />
                      <th className="px-4 py-3 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sortedVolumes.map(({ appId, appName, hasLogo, logoVersion, volume }) => {
                      const key = JSON.stringify([appId, volume])
                      const calculation = volumeSizes[key]
                      const size = calculation?.size
                      const unit = size === undefined || size < 1024
                        ? 0 : Math.min(Math.floor(Math.log(size) / Math.log(1024)), 4)
                      const large = size !== undefined && size > 100 * 1024 * 1024
                      return (
                        <tr key={key} className="hover:bg-muted/25">
                          <td className="px-4 py-3">
                            <Link
                              to={`/apps/${encodeURIComponent(appId)}`}
                              className="flex items-center gap-3 whitespace-nowrap font-medium hover:underline"
                            >
                              <AppLogo
                                appId={hasLogo ? appId : undefined}
                                logoVersion={logoVersion}
                                alt=""
                                className="size-8"
                              />
                              {appName}
                            </Link>
                          </td>
                          <td className="min-w-56 max-w-96 break-all px-4 py-3 font-mono text-xs">{volume}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              {calculation?.pending && <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />}
                              {calculation?.pending ? (
                                <span className="text-xs text-muted-foreground">Calculating…</span>
                              ) : calculation?.error ? (
                                <span className="text-xs text-red-600 dark:text-red-400" title={calculation.error}>Unavailable</span>
                              ) : size !== undefined ? (
                                <span title={`${size.toLocaleString()} bytes`}>
                                  {unit === 0 ? `${size} B` : `${(size / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${["B", "KB", "MB", "GB", "TB"][unit]}`}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Waiting…</span>
                              )}
                              {large && (
                                <Tooltip
                                  text="This volume may be too large to back up reliably. Backups can take a long time or exceed your Git provider’s LFS limits."
                                  tabIndex={0}
                                  contentClassName="w-72 whitespace-normal px-3 py-2 font-sans leading-relaxed"
                                >
                                  <span className="cursor-help" aria-label="Warning: this volume may be too large to back up reliably.">
                                    <TriangleAlert className="size-4 text-amber-500" aria-hidden="true" />
                                  </span>
                                </Tooltip>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8 text-xs"
                              disabled={excludingVolume === key}
                              onClick={() => void exclude(appId, volume)}
                            >
                              {excludingVolume === key
                                ? <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
                                : <X className="mr-1.5 size-3.5" />}
                              {excludingVolume === key ? "Excluding…" : "Exclude"}
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {volumeError && (
              <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-300">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <p>{volumeError}</p>
              </div>
            )}
          </CardContent>
        </Card>
        <div className="flex justify-center pt-1">
          <a
            href="/api/v1/backup/docker-compose.yml"
            download="docker-compose.yml"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            <FileDown className="size-3.5" />
            Export Docker Compose YAML
          </a>
        </div>
      </div>
    </section>
  )
}
