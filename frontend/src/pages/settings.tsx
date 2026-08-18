import { useEffect, useRef, useState, type FormEvent } from "react"
import { Check, CircleX, Copy, LoaderCircle, TriangleAlert } from "lucide-react"
import { useSearchParams } from "react-router-dom"

import { PageHeader } from "@/components/page-header"
import { ErrorState } from "@/components/resource-states"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cacheApiResponse, useApi } from "@/hooks/use-api"
import { apiRequest } from "@/lib/api"
import { checkDomainConnection } from "@/lib/domain-connection"
import type { DomainReachability, DomainSettings } from "@/lib/types"

export function DomainSettingsPage() {
  const [searchParams] = useSearchParams()
  const openCustomDomain = searchParams.get("domain") === "custom"
  const domainRequest = useApi<DomainSettings>("/api/v1/ddns/domain")
  const initialized = useRef(false)
  const [domain, setDomain] = useState("")
  const [domainType, setDomainType] = useState<"containarr" | "custom">(
    "containarr"
  )
  const [savedSettings, setSavedSettings] = useState<DomainSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [reachability, setReachability] = useState<DomainReachability | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (domainRequest.status !== "success" || initialized.current) return
    initialized.current = true
    setDomain(domainRequest.data.customDomain ?? "")
    setDomainType(
      openCustomDomain || domainRequest.data.customDomain
        ? "custom"
        : "containarr"
    )
  }, [domainRequest, openCustomDomain])

  useEffect(() => {
    if (openCustomDomain) setDomainType("custom")
  }, [openCustomDomain])

  if (domainRequest.status === "loading") {
    return (
      <section>
        <PageHeader
          title="Domain"
          description="Configure Containarr for your environment."
        />
        <Skeleton className="mt-8 h-80 w-full max-w-3xl rounded-xl" />
      </section>
    )
  }

  if (domainRequest.status === "error") {
    return (
      <ErrorState message={domainRequest.error} onRetry={domainRequest.reload} />
    )
  }

  const settings = savedSettings ?? domainRequest.data
  const normalizedDomain = domain.trim().toLowerCase().replace(/\.$/, "")
  const cnameName = `*.${normalizedDomain || "homelab.yourdomain.com"}`
  const installationIp = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(
    window.location.hostname
  )
    ? window.location.hostname
    : null
  const installationTarget = installationIp ?? "your installation's LAN IP"
  const savedDomainType = settings.customDomain ? "custom" : "containarr"
  const unchanged =
    domainType === savedDomainType &&
    (domainType === "containarr" || normalizedDomain === settings.customDomain)

  async function saveDomain(event: FormEvent) {
    event.preventDefault()
    await updateDomain(domainType === "custom" ? normalizedDomain : null)
  }

  async function updateDomain(value: string | null) {
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const updated = await apiRequest<DomainSettings>("/api/v1/ddns/domain", {
        method: "PUT",
        body: JSON.stringify({ domain: value }),
      })
      cacheApiResponse("/api/v1/ddns/domain", updated)
      setSavedSettings(updated)
      setDomain(updated.customDomain ?? "")
      setDomainType(updated.customDomain ? "custom" : "containarr")
      setReachability(null)
      setCheckError(null)
      setSaved(true)
      domainRequest.reload()

      setSaving(false)
      setChecking(true)
      try {
        const updatedReachability = await checkDomainConnection(updated.domain, {
          force: true,
        })
        setReachability(updatedReachability)
      } catch (requestError) {
        setCheckError(
          requestError instanceof Error
            ? requestError.message
            : "Connection check failed."
        )
      } finally {
        setChecking(false)
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Domain update failed."
      )
    } finally {
      setSaving(false)
    }
  }

  async function checkDomain() {
    setChecking(true)
    setCheckError(null)
    setReachability(null)
    const checkedDomain =
      domainType === "custom" ? normalizedDomain : settings.generatedDomain
    try {
      const updatedReachability = await checkDomainConnection(checkedDomain, {
        force: true,
      })
      setReachability(updatedReachability)
    } catch (requestError) {
      setCheckError(
        requestError instanceof Error
          ? requestError.message
          : "Connection check failed."
      )
    } finally {
      setChecking(false)
    }
  }

  return (
    <section>
      <PageHeader
        title="Domain"
        description="Choose how your apps and proxies are reached."
      />

      <div className="mt-8 max-w-3xl space-y-5">
        <form onSubmit={(event) => void saveDomain(event)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <DomainTypeOption
              checked={domainType === "containarr"}
              label="Containarr.me"
              description={`*.${settings.generatedDomain}`}
              onChange={() => {
                setDomainType("containarr")
                setSaved(false)
                setReachability(null)
                setCheckError(null)
              }}
            />
            <DomainTypeOption
              checked={domainType === "custom"}
              label="Your Domain"
              description={`*.${settings.customDomain ?? "yourdomain.com"}`}
              onChange={() => {
                setDomainType("custom")
                setSaved(false)
                setReachability(null)
                setCheckError(null)
              }}
            />
          </div>

          {domainType === "custom" && (
            <Card className="mt-5">
              <CardContent className="pt-6">
                <div>
                  <label htmlFor="custom-domain" className="text-sm font-medium">
                    Your Domain
                  </label>
                  <div className="mt-1.5 flex h-10 rounded-lg border bg-background shadow-xs focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-ring/30">
                    <span className="flex items-center border-r px-3 font-mono text-xs text-muted-foreground">
                      *.
                    </span>
                    <Input
                      id="custom-domain"
                      type="text"
                      inputMode="url"
                      autoComplete="url"
                      value={domain}
                      onChange={(event) => {
                        setDomain(event.target.value)
                        setSaved(false)
                        setReachability(null)
                        setCheckError(null)
                      }}
                      placeholder="homelab.yourdomain.com"
                      className="h-full rounded-l-none border-0 font-mono text-xs shadow-none focus:ring-0"
                      disabled={saving}
                      required
                    />
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Every app and proxy gets its own hostname beneath this wildcard.
                  </p>
                </div>

                <div className="mt-6 border-t pt-6">
                  <p className="text-sm font-medium">DNS configuration</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    We recommend creating the following record with your DNS provider:
                  </p>

                  <dl className="mt-4 grid overflow-hidden rounded-lg border sm:grid-cols-[7rem_1fr]">
                    <DnsRow label="Type" value="CNAME" />
                    <DnsRow label="Name" value={cnameName} />
                    <DnsRow label="Target" value={settings.generatedDomain} copyable />
                  </dl>

                  <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                    The <code className="font-mono text-foreground">*.</code> prefix
                    is fixed. It lets app names such as <code className="font-mono text-foreground">plex</code>{" "}
                    resolve beneath your custom domain. The Containarr target keeps
                    following this installation&apos;s public IP automatically. An A or
                    AAAA record pointing directly to this installation also works.
                  </p>
                </div>

                <div className="mt-5 border-t pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Connection check</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Tests the wildcard over HTTP and HTTPS from the internet.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={checking || !normalizedDomain}
                      onClick={() => void checkDomain()}
                    >
                      {checking && <LoaderCircle className="mr-2 size-4 animate-spin" />}
                      Check connection
                    </Button>
                  </div>

                  {checkError && (
                    <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
                      {checkError}
                    </p>
                  )}
                  {reachability && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <ReachabilityStatus
                        label="CNAME"
                        ok={reachability.dns.configured}
                        warning={!reachability.dns.configured}
                        detail={
                          reachability.dns.configured
                            ? reachability.dns.target || "Configured"
                            : "No CNAME found. A or AAAA records can still work."
                        }
                      />
                      <ReachabilityStatus
                        label="HTTP"
                        ok={reachability.http.reachable}
                        detail={protocolDetail(reachability.http)}
                      />
                      <ReachabilityStatus
                        label="HTTPS"
                        ok={reachability.https.reachable}
                        detail={protocolDetail(reachability.https)}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {domainType === "containarr" && (
            <Card className="mt-5">
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Connection check</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Tests the generated domain over HTTP and HTTPS from the internet.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={checking}
                    onClick={() => void checkDomain()}
                  >
                    {checking && <LoaderCircle className="mr-2 size-4 animate-spin" />}
                    Check connection
                  </Button>
                </div>

                {checkError && (
                  <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
                    {checkError}
                  </p>
                )}
                {reachability && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <ReachabilityStatus
                      label="HTTP"
                      ok={reachability.http.reachable}
                      detail={protocolDetail(reachability.http)}
                    />
                    <ReachabilityStatus
                      label="HTTPS"
                      ok={reachability.https.reachable}
                      detail={protocolDetail(reachability.https)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="mt-4 flex min-h-9 flex-wrap items-center gap-3">
            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            {saved && (
              <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                <Check className="size-4" />
                Domain settings saved.
              </p>
            )}
            <Button
              type="submit"
              className="ml-auto"
              disabled={
                saving || unchanged || (domainType === "custom" && !normalizedDomain)
              }
            >
              {saving && <LoaderCircle className="mr-2 size-4 animate-spin" />}
              Save
            </Button>
          </div>

          <Card className="mt-5 border-amber-500/25 bg-amber-500/5 shadow-none dark:border-amber-400/20 dark:bg-amber-400/5">
            <CardContent className="pt-6">
              <p className="text-sm font-medium">Port Forwarding</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                In your router, forward TCP ports 80 and 443 to {installationTarget}.
              </p>

              <dl className="mt-4 grid overflow-hidden rounded-lg border sm:grid-cols-[7rem_1fr]">
                <DnsRow label="HTTP" value={`TCP 80 → ${installationTarget}:80`} />
                <DnsRow label="HTTPS" value={`TCP 443 → ${installationTarget}:443`} />
              </dl>
            </CardContent>
          </Card>
        </form>
      </div>
    </section>
  )
}

function DomainTypeOption({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean
  description: string
  label: string
  onChange: () => void
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
        checked ? "border-foreground/30 bg-muted/40" : "hover:bg-muted/20"
      }`}
    >
      <input
        type="radio"
        name="domain-type"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 size-4 accent-foreground"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block break-all text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  )
}

function ReachabilityStatus({
  detail,
  label,
  ok,
  warning = false,
}: {
  detail: string
  label: string
  ok: boolean
  warning?: boolean
}) {
  const Icon = warning ? TriangleAlert : ok ? Check : CircleX
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div
        className={`flex items-center gap-1.5 text-sm font-medium ${
          warning
            ? "text-amber-700 dark:text-amber-400"
            : ok
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-red-600 dark:text-red-400"
        }`}
      >
        <Icon className="size-4" />
        {label}
      </div>
      <p className="mt-1.5 break-words text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function protocolDetail(result: {
  reachable: boolean
  statusCode: number | null
  error: string | null
}) {
  if (result.reachable) return "Reachable"
  return result.error || "Not reachable"
}

function DnsRow({
  copyable = false,
  label,
  value,
}: {
  copyable?: boolean
  label: string
  value: string
}) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="contents">
      <dt className="border-b bg-muted/40 px-4 py-3 text-xs font-medium text-muted-foreground last:border-b-0 sm:border-r">
        {label}
      </dt>
      <dd className="flex min-w-0 items-center gap-2 border-b px-4 py-3 font-mono text-xs last:border-b-0">
        {copyable ? (
          <button
            type="button"
            aria-label={`Copy ${label}`}
            title={copied ? "Copied" : `Copy ${label}`}
            className="flex min-w-0 items-center gap-2 rounded p-1 transition-colors hover:bg-muted"
            onClick={async () => {
              let copiedSuccessfully = false

              try {
                if (navigator.clipboard?.writeText) {
                  await navigator.clipboard.writeText(value)
                  copiedSuccessfully = true
                }
              } catch {
                // Clipboard access is commonly blocked when Containarr is opened over HTTP.
              }

              if (!copiedSuccessfully) {
                const textArea = document.createElement("textarea")
                textArea.value = value
                textArea.setAttribute("readonly", "")
                textArea.style.position = "fixed"
                textArea.style.opacity = "0"
                document.body.appendChild(textArea)
                textArea.select()
                copiedSuccessfully = document.execCommand("copy")
                textArea.remove()
              }

              if (copiedSuccessfully) {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1500)
              }
            }}
          >
            <span className="min-w-0 overflow-x-auto">{value}</span>
            {copied ? (
              <Check className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Copy className="size-3.5 shrink-0 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="min-w-0 overflow-x-auto">{value}</span>
        )}
      </dd>
    </div>
  )
}
