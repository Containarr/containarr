import { useEffect, useState, type FormEvent } from "react"
import { Check, CircleAlert, Copy, DatabaseBackup, FileDown, LoaderCircle } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { ErrorState } from "@/components/resource-states"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cacheApiResponse, useApi } from "@/hooks/use-api"
import { apiRequest } from "@/lib/api"
import type { BackupSettings } from "@/lib/types"

export function BackupsPage() {
  const settings = useApi<BackupSettings>("/api/v1/backup")
  const [repositoryUrl, setRepositoryUrl] = useState("")
  const [branch, setBranch] = useState("main")
  const [saving, setSaving] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [copied, setCopied] = useState(false)
  const [savedSettings, setSavedSettings] = useState<BackupSettings | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (settings.status !== "success") return
    setRepositoryUrl(settings.data.repositoryUrl)
    setBranch(settings.data.branch)
  }, [settings.status, settings.status === "success" ? settings.data : null])

  if (settings.status === "loading") {
    return (
      <section>
        <PageHeader title="Backups" description="Keep a Git copy of your Containarr database." />
        <Skeleton className="mt-8 h-96 w-full max-w-3xl rounded-xl" />
      </section>
    )
  }

  if (settings.status === "error") {
    return <ErrorState message={settings.error} onRetry={settings.reload} />
  }

  const currentSettings = savedSettings ?? settings.data

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const updated = await apiRequest<BackupSettings>("/api/v1/backup", {
        method: "PUT",
        body: JSON.stringify({ repositoryUrl, branch }),
      })
      cacheApiResponse("/api/v1/backup", updated)
      setSavedSettings(updated)
      setMessage(updated.error ? null : "Repository connected and backup pushed.")
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

  return (
    <section>
      <PageHeader
        title="Backups"
        description="Push db.sqlite to a private Git repository when your configuration changes."
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
              <li>Create a private, empty Git repository.</li>
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
                <div className={`flex items-start gap-3 rounded-xl border p-4 ${message.includes("pushed") ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-300"}`}>
                  {message.includes("pushed") ? <Check className="mt-0.5 size-5 shrink-0" /> : <CircleAlert className="mt-0.5 size-5 shrink-0" />}
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
