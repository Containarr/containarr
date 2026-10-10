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
  const [strategy, setStrategy] = useState<BackupSettings["strategy"]>("git")
  const [keepBackups, setKeepBackups] = useState("7")
  const [s3, setS3] = useState<BackupSettings["s3"]>({ endpoint: "", region: "", bucket: "", prefix: "containarr", accessKeyId: "", hasSecretAccessKey: false })
  const [s3Secret, setS3Secret] = useState("")
  const [sftp, setSftp] = useState<BackupSettings["sftp"]>({ host: "", port: 22, username: "", directory: "" })
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
    setStrategy(settings.data.strategy)
    setKeepBackups(String(settings.data.keepBackups))
    setS3(settings.data.s3)
    setS3Secret("")
    setSftp(settings.data.sftp)
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
        <PageHeader title="Backups" description="Back up your configuration and selected app data." />
        <Skeleton className="mt-8 h-96 w-full max-w-3xl rounded-xl" />
      </section>
    )
  }

  if (settings.status === "error") {
    return <ErrorState message={settings.error} onRetry={settings.reload} />
  }

  const currentSettings = savedSettings ?? settings.data
  const unsavedChanges = strategy !== currentSettings.strategy
    || Number(intervalHours) !== currentSettings.intervalHours
    || (strategy === "git"
      ? repositoryUrl !== currentSettings.repositoryUrl || branch !== currentSettings.branch
      : Number(keepBackups) !== currentSettings.keepBackups || (strategy === "s3"
        ? JSON.stringify(s3) !== JSON.stringify(currentSettings.s3) || Boolean(s3Secret)
        : JSON.stringify(sftp) !== JSON.stringify(currentSettings.sftp)))
  const busy = saving || backingUp || currentSettings.backingUp
  const messageIsSuccess = message === "Backup completed."
    || message === "Backup settings saved."

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const updated = await apiRequest<BackupSettings>("/api/v1/backup", {
        method: "PUT",
        body: JSON.stringify({
          strategy, repositoryUrl, branch, intervalHours: Number(intervalHours),
          ...(strategy !== "git" ? { keepBackups: Number(keepBackups) } : {}),
          ...(strategy === "s3" ? { s3: { ...s3, secretAccessKey: s3Secret } } : {}),
          ...(strategy === "sftp" ? { sftp } : {}),
        }),
      })
      cacheApiResponse("/api/v1/backup", updated)
      setSavedSettings(updated)
      setRepositoryUrl(updated.repositoryUrl)
      setBranch(updated.branch)
      setKeepBackups(String(updated.keepBackups))
      setS3(updated.s3)
      setS3Secret("")
      setSftp(updated.sftp)
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
      setMessage("Backup completed.")
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
        description="Back up your configuration and selected app volumes."
      />

      <div className="mt-8 max-w-3xl space-y-5">
        <fieldset disabled={busy}>
          <legend className="mb-3 text-sm font-medium">Backup Strategy</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              { value: "git", label: "Git", description: "Private repository with Git LFS." },
              { value: "s3", label: "S3", description: "Amazon S3 or compatible storage." },
              { value: "sftp", label: "SFTP", description: "Your server over SSH." },
            ] as const).map((option) => (
              <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${strategy === option.value ? "border-foreground/30 bg-muted/40" : "hover:bg-muted/20"}`}>
                <input
                  type="radio"
                  name="backup-strategy"
                  form="backup-settings"
                  value={option.value}
                  checked={strategy === option.value}
                  onChange={() => { setStrategy(option.value); setMessage(null) }}
                  className="mt-0.5 size-4 accent-foreground"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DatabaseBackup className="size-4 text-muted-foreground" />
              {strategy === "git" ? "Git Repository" : strategy === "s3" ? "S3 Storage" : "SFTP Server"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            {strategy === "git" && <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Create a private, empty Git repository with Git LFS support.</li>
              <li>Add the deploy key below with write access.</li>
              <li>Enter the repository&apos;s SSH URL and save.</li>
            </ol>}
            {strategy === "s3" && <p className="text-sm text-muted-foreground">
              Use a private bucket with credentials that can upload, list, and delete backups.
            </p>}
            {strategy === "sftp" && <p className="text-sm text-muted-foreground">
              Add the SSH key below to your server user&apos;s authorized_keys and allow access to the backup directory.
            </p>}

            {strategy !== "s3" && <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="backup-deploy-key" className="text-sm font-medium">{strategy === "git" ? "Deploy Key" : "SSH Key"}</label>
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
            </div>}

            <form id="backup-settings" onSubmit={(event) => void save(event)} className="mt-6 border-t pt-6">
              <fieldset disabled={busy} className="space-y-5">
                {strategy === "git" && <>
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

                </>}

                {strategy === "s3" && <>
                  <div className="grid gap-5 sm:grid-cols-2">
                    {([
                      { key: "endpoint", label: "Endpoint URL", placeholder: "https://s3.eu-west-1.amazonaws.com", type: "url" },
                      { key: "region", label: "Region (optional)", placeholder: "Automatic", type: "text" },
                      { key: "bucket", label: "Bucket", placeholder: "my-backups", type: "text" },
                      { key: "prefix", label: "Path Prefix", placeholder: "containarr", type: "text" },
                      { key: "accessKeyId", label: "Access Key ID", placeholder: "", type: "text" },
                    ] as const).map((field) => (
                      <div key={field.key}>
                        <label htmlFor={`backup-s3-${field.key}`} className="text-sm font-medium">{field.label}</label>
                        <Input id={`backup-s3-${field.key}`} type={field.type} required={field.key !== "prefix" && field.key !== "region"}
                          value={s3[field.key]} onChange={(event) => setS3({ ...s3, [field.key]: event.target.value })}
                          placeholder={field.placeholder} autoComplete="off" className="mt-1.5 font-mono text-xs" />
                        {field.key === "region" && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          Detected for AWS, Backblaze, and Cloudflare R2. Other endpoints default to us-east-1; override if your provider requires a different region.
                        </p>}
                      </div>
                    ))}
                    <div>
                      <label htmlFor="backup-s3-secret" className="text-sm font-medium">Secret Access Key</label>
                      <Input id="backup-s3-secret" type="password" autoComplete="new-password" required={!s3.hasSecretAccessKey}
                        value={s3Secret} onChange={(event) => setS3Secret(event.target.value)}
                        placeholder={s3.hasSecretAccessKey ? "Saved — leave blank to keep" : ""} className="mt-1.5 font-mono text-xs" />
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    If your bucket keeps deleted object versions, configure its lifecycle rules to expire them to reclaim storage.
                  </p>
                </>}

                {strategy === "sftp" && <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="backup-sftp-host" className="text-sm font-medium">Host</label>
                    <Input id="backup-sftp-host" required value={sftp.host} onChange={(event) => setSftp({ ...sftp, host: event.target.value })}
                      placeholder="backup.mydomain.com" className="mt-1.5 font-mono text-xs" />
                  </div>
                  <div>
                    <label htmlFor="backup-sftp-port" className="block text-sm font-medium">Port</label>
                    <Input id="backup-sftp-port" type="number" required min="1" max="65535" step="1" value={sftp.port}
                      onChange={(event) => setSftp({ ...sftp, port: Number(event.target.value) })} className="mt-1.5 max-w-48" />
                  </div>
                  <div>
                    <label htmlFor="backup-sftp-username" className="text-sm font-medium">Username</label>
                    <Input id="backup-sftp-username" required value={sftp.username} onChange={(event) => setSftp({ ...sftp, username: event.target.value })}
                      autoComplete="off" className="mt-1.5 font-mono text-xs" />
                  </div>
                  <div>
                    <label htmlFor="backup-sftp-directory" className="text-sm font-medium">Directory</label>
                    <Input id="backup-sftp-directory" required value={sftp.directory} onChange={(event) => setSftp({ ...sftp, directory: event.target.value })}
                      placeholder="/backups/containarr" className="mt-1.5 font-mono text-xs" />
                  </div>
                </div>}

                {strategy !== "git" && <div>
                  <label htmlFor="backup-keep" className="block text-sm font-medium">Keep Backups</label>
                  <div className="mt-1.5 flex max-w-48 overflow-hidden rounded-lg border bg-background shadow-xs focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-ring/30">
                    <Input id="backup-keep" type="number" required min="1" max="1000" step="1" value={keepBackups}
                      onChange={(event) => setKeepBackups(event.target.value)} aria-describedby="backup-keep-unit"
                      className="rounded-none border-0 shadow-none focus:ring-0" />
                    <span id="backup-keep-unit" className="flex shrink-0 items-center border-l bg-muted/30 px-3 text-sm text-muted-foreground">
                      backups
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Older backups from this installation are deleted after a new backup is uploaded successfully. Set to 1 to keep only the latest.
                  </p>
                </div>}

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
                        disabled={busy || unsavedChanges}
                        title={unsavedChanges ? "Save changes before backing up." : undefined}
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
              </fieldset>
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
                                  text={strategy === "git" ? "This volume may be too large to back up reliably. Backups can take a long time or exceed your Git provider’s LFS limits." : "Large volumes can take a long time to upload and use significant storage for each retained backup."}
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
