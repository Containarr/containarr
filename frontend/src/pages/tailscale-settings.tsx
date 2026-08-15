import { useEffect, useState, type FormEvent } from "react"
import { ArrowUpRight, LoaderCircle } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { ErrorState } from "@/components/resource-states"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cacheApiResponse, useApi } from "@/hooks/use-api"
import { apiRequest } from "@/lib/api"
import type { TailscaleDevice, TailscaleSettings } from "@/lib/types"

export function TailscaleSettingsPage() {
  const settings = useApi<TailscaleSettings>("/api/v1/tailscale")
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [secretFocused, setSecretFocused] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devices, setDevices] = useState<TailscaleDevice[] | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<
    "not_configured" | "checking" | "connected" | "error"
  >("not_configured")
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [connectionCheck, setConnectionCheck] = useState(0)

  useEffect(() => {
    if (settings.status !== "success") return
    setClientId(settings.data.clientId)
    if (!settings.data.clientSecretConfigured) {
      setConnectionStatus("not_configured")
      return
    }

    const controller = new AbortController()
    setConnectionStatus("checking")
    setConnectionError(null)
    void apiRequest<TailscaleDevice[]>("/api/v1/tailscale/devices", {
      signal: controller.signal,
    }).then((connectedDevices) => {
      setDevices(connectedDevices)
      setConnectionStatus("connected")
    }).catch((requestError) => {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return
      setConnectionStatus("error")
      setConnectionError(
        requestError instanceof Error ? requestError.message : "Connection check failed."
      )
    })
    return () => controller.abort()
  }, [
    settings.status,
    settings.status === "success" ? settings.data.clientId : null,
    settings.status === "success" ? settings.data.clientSecretConfigured : null,
    connectionCheck,
  ])

  if (settings.status === "loading") {
    return (
      <section>
        <PageHeader title="Tailscale" description="Connect your tailnet to firewall policies." />
        <Skeleton className="mt-8 h-96 w-full max-w-3xl rounded-xl" />
      </section>
    )
  }

  if (settings.status === "error") {
    return <ErrorState message={settings.error} onRetry={settings.reload} />
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setDevices(null)
    try {
      const updated = await apiRequest<TailscaleSettings>("/api/v1/tailscale", {
        method: "PUT",
        body: JSON.stringify({ clientId, clientSecret }),
      })
      cacheApiResponse("/api/v1/tailscale", updated)
      settings.reload()
      setClientSecret("")
      setConnectionStatus("checking")
      setConnectionError(null)
      setConnectionCheck((value) => value + 1)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Tailscale setup failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <PageHeader
        title="Tailscale"
        description="Use devices on your tailnet in firewall policies."
      />

      <div className="mt-8 max-w-3xl space-y-5">
        <Card className="shadow-none">
          <CardContent className="pt-6">
            <h2 className="font-medium">Create a Tailscale Credential</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              In the Tailscale admin console, create a trust credential named
              <span className="font-medium text-foreground"> Containarr</span> with
              <span className="font-medium text-foreground"> All - Read</span> permission.
            </p>
            <a
              href="https://console.tailscale.com/admin/settings/trust-credentials/add"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open Tailscale admin console
              <ArrowUpRight className="size-4" />
            </a>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardContent className="pt-6">
            <form onSubmit={(event) => void save(event)} className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-5">
                <div>
                  <p className="text-sm font-medium">Connection</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Verified against the Tailscale API.
                  </p>
                </div>
                {connectionStatus === "checking" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    <LoaderCircle className="size-3 animate-spin" />
                    Checking…
                  </span>
                )}
                {connectionStatus === "connected" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <span className="size-1.5 rounded-full bg-current" />
                    Connected{devices ? ` · ${devices.length} ${devices.length === 1 ? "device" : "devices"}` : ""}
                  </span>
                )}
                {connectionStatus === "error" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-400">
                    <span className="size-1.5 rounded-full bg-current" />
                    Connection failed
                  </span>
                )}
                {connectionStatus === "not_configured" && (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    Not configured
                  </span>
                )}
              </div>
              {connectionError && (
                <p className="text-xs text-red-600 dark:text-red-400">{connectionError}</p>
              )}
              <div>
                <label htmlFor="tailscale-client-id" className="text-sm font-medium">Client ID</label>
                <Input
                  id="tailscale-client-id"
                  required
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  placeholder="k123…"
                  className="mt-1.5 font-mono text-xs"
                />
              </div>
              <div>
                <label htmlFor="tailscale-client-secret" className="text-sm font-medium">Client Secret</label>
                <Input
                  id="tailscale-client-secret"
                  required={!settings.data.clientSecretConfigured}
                  type="password"
                  value={
                    settings.data.clientSecretConfigured && !secretFocused && !clientSecret
                      ? "saved-secret"
                      : clientSecret
                  }
                  onFocus={() => setSecretFocused(true)}
                  onBlur={() => setSecretFocused(false)}
                  onChange={(event) => setClientSecret(event.target.value)}
                  placeholder={settings.data.clientSecretConfigured ? "" : "tskey-client-…"}
                  className="mt-1.5 font-mono text-xs"
                />
                {!settings.data.clientSecretConfigured && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    The secret is stored by Containarr and is never returned to the browser.
                  </p>
                )}
              </div>

              {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <div className="flex justify-end border-t pt-5">
                <Button type="submit" disabled={saving}>
                  {saving && <LoaderCircle className="mr-2 size-4 animate-spin" />}
                  Save
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
