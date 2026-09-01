import { Children, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  ArrowLeft,
  ArrowUp,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  File,
  FileUp,
  Folder,
  FolderPlus,
  Globe2,
  Info,
  LoaderCircle,
  Minus,
  PackagePlus,
  Plus,
  Save,
  Search,
  ShieldCheck,
  X,
} from "lucide-react"
import { useSearchParams } from "react-router-dom"

import { AppLogo } from "@/components/app-logo"
import { FirewallPolicyDialog } from "@/components/firewall-policy-dialog"
import { NewNetworkDialog } from "@/components/new-network-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useApi } from "@/hooks/use-api"
import { apiRequest } from "@/lib/api"
import { appConfigurationFromCompose } from "@/lib/docker-compose"
import { TLS_OPTIONS } from "@/lib/tls"
import type { AppConfiguration, AppResource, DockerNetworkAttachment, DockerNetworkResource, DockerPort, PolicyResource, RegistryApp } from "@/lib/types"

type DialogProps = {
  onClose: () => void
  onCreated: (app: AppResource) => void
  open: boolean
}

type EnvironmentRow = {
  id: string
  key: string
  value: string
  valueRequired?: boolean
}
type VolumeRow = {
  id: string
  host: string
  container: string
  hostRequired?: boolean
  containerRequired?: boolean
}
type PortRow = {
  id: string
  host: string
  hostIp?: string
  container: string
  protocol: "tcp" | "udp"
}
type CapabilityRow = { id: string; value: string }

let nextRowId = 0
const createRowId = () => `row-${++nextRowId}`

const LINUX_CAPABILITIES = [
  "CAP_AUDIT_CONTROL",
  "CAP_AUDIT_READ",
  "CAP_AUDIT_WRITE",
  "CAP_BLOCK_SUSPEND",
  "CAP_BPF",
  "CAP_CHECKPOINT_RESTORE",
  "CAP_CHOWN",
  "CAP_DAC_OVERRIDE",
  "CAP_DAC_READ_SEARCH",
  "CAP_FOWNER",
  "CAP_FSETID",
  "CAP_IPC_LOCK",
  "CAP_IPC_OWNER",
  "CAP_KILL",
  "CAP_LEASE",
  "CAP_LINUX_IMMUTABLE",
  "CAP_MAC_ADMIN",
  "CAP_MAC_OVERRIDE",
  "CAP_MKNOD",
  "CAP_NET_ADMIN",
  "CAP_NET_BIND_SERVICE",
  "CAP_NET_BROADCAST",
  "CAP_NET_RAW",
  "CAP_PERFMON",
  "CAP_SETFCAP",
  "CAP_SETGID",
  "CAP_SETPCAP",
  "CAP_SETUID",
  "CAP_SYS_ADMIN",
  "CAP_SYS_BOOT",
  "CAP_SYS_CHROOT",
  "CAP_SYS_MODULE",
  "CAP_SYS_NICE",
  "CAP_SYS_PACCT",
  "CAP_SYS_PTRACE",
  "CAP_SYS_RAWIO",
  "CAP_SYS_RESOURCE",
  "CAP_SYS_TIME",
  "CAP_SYS_TTY_CONFIG",
  "CAP_SYSLOG",
  "CAP_WAKE_ALARM",
] as const

export function InstallAppDialog(props: DialogProps) {
  if (!props.open) return null
  return <InstallAppDialogContent {...props} />
}

export function EditAppDialog({
  app,
  onClose,
  onSaved,
  open,
}: {
  app: AppResource
  onClose: () => void
  onSaved: (app: AppResource, dockerPropertiesChanged: boolean) => void
  open: boolean
}) {
  if (!open) return null
  return (
    <EditAppDialogContent app={app} onClose={onClose} onSaved={onSaved} />
  )
}

function EditAppDialogContent({
  app,
  onClose,
  onSaved,
}: {
  app: AppResource
  onClose: () => void
  onSaved: (app: AppResource, dockerPropertiesChanged: boolean) => void
}) {
  const domainRequest = useApi<{ domain: string }>("/api/v1/ddns/domain")
  const domain =
    domainRequest.status === "success" ? domainRequest.data.domain : "…"

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-app-title"
        className="relative flex max-h-[92vh] min-w-0 w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="edit-app-title" className="truncate font-semibold">
              Edit {app.name || "App"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Update routing and container configuration.
            </p>
          </div>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </button>
        </div>
        <CustomAppForm
          app={app}
          domain={domain}
          onSaved={onSaved}
        />
      </div>
    </div>
  )
}

function InstallAppDialogContent({ onClose, onCreated }: DialogProps) {
  const [searchParams] = useSearchParams()
  const importContainerId = searchParams.get("import")
  const [mode, setMode] = useState<"registry" | "custom" | "compose">(
    searchParams.get("mode") === "custom" ? "custom" : "registry"
  )
  const [composeConfiguration, setComposeConfiguration] = useState<AppConfiguration | null>(null)
  const [registryFilter, setRegistryFilter] = useState("")
  const [selected, setSelected] = useState<{
    id: string
    app: RegistryApp
  } | null>(null)
  const registry = useApi<Record<string, RegistryApp>>("/api/v1/app/registry")
  const domainRequest = useApi<{ domain: string }>("/api/v1/ddns/domain")
  const domain =
    domainRequest.status === "success" ? domainRequest.data.domain : "…"
  const normalizedRegistryFilter = registryFilter.trim().toLowerCase()
  const filteredRegistry =
    registry.status === "success"
      ? Object.entries(registry.data).filter(([id, app]) =>
          [id, app.name, app.category, app.description, app.dockerImage].some(
            (value) => value.toLowerCase().includes(normalizedRegistryFilter)
          )
        )
      : []

  useEffect(() => {
    const registryId = searchParams.get("registryId")
    if (!registryId || selected || registry.status !== "success") return
    const app = registry.data[registryId]
    if (app) setSelected({ id: registryId, app })
  }, [registry, searchParams, selected])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-app-title"
        className="relative flex max-h-[92vh] min-w-0 w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {selected && !importContainerId && (
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-lg hover:bg-muted"
                onClick={() => setSelected(null)}
                aria-label="Back to registry"
              >
                <ArrowLeft className="size-4" />
              </button>
            )}
            <div className="min-w-0">
              <h2 id="install-app-title" className="truncate font-semibold">
                {importContainerId || composeConfiguration
                  ? "New App"
                  : selected
                    ? `Install ${selected.app.name}`
                    : "Add an app"}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {importContainerId
                  ? "Review and adjust the imported container settings."
                  : composeConfiguration
                    ? "Review and adjust the imported Compose settings."
                    : mode === "compose"
                      ? "Paste or drop a Compose file to configure a custom app."
                      : selected
                        ? "Review the defaults and add optional overrides."
                        : "Choose a registry app or configure your own container."}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </button>
        </div>

        {!selected && !importContainerId && (
          <div className="border-b px-5 pt-3 sm:px-6">
            <div className="flex gap-5">
              {(["registry", "compose", "custom"] as const).map((option) => (
                <button
                  type="button"
                  key={option}
                  onClick={() => {
                    if (option !== "custom") setComposeConfiguration(null)
                    setMode(option)
                  }}
                  className={`border-b-2 px-0.5 pb-3 text-sm font-medium capitalize transition-colors ${
                    mode === option
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option === "compose" ? "Docker Compose" : option}
                </button>
              ))}
            </div>
          </div>
        )}

        {importContainerId ? (
          <ImportAppForm
            containerId={importContainerId}
            domain={domain}
            onCreated={onCreated}
          />
        ) : mode === "compose" ? (
          <ComposeImportForm
            onNext={(configuration) => {
              setComposeConfiguration(configuration)
              setMode("custom")
            }}
          />
        ) : selected ? (
          <RegistryInstallForm
            registryId={selected.id}
            app={selected.app}
            domain={domain}
            onCreated={onCreated}
          />
        ) : mode === "custom" ? (
          <CustomAppForm
            domain={domain}
            initialApp={composeConfiguration}
            onSaved={onCreated}
          />
        ) : (
          <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto p-5 sm:p-6">
            {registry.status === "loading" ? (
              <LoadingRegistry />
            ) : registry.status === "error" ? (
              <RegistryError error={registry.error} retry={registry.reload} />
            ) : (
              <>
                <div className="relative mb-4">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    value={registryFilter}
                    onChange={(event) => setRegistryFilter(event.target.value)}
                    placeholder="Search apps…"
                    aria-label="Search app registry"
                    className="pl-9"
                    autoFocus
                  />
                </div>

                {filteredRegistry.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {filteredRegistry.map(([id, app]) => (
                      <button
                        type="button"
                        key={id}
                        onClick={() => setSelected({ id, app })}
                        className="flex flex-col rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:border-foreground/25 hover:bg-muted/20 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-start gap-3">
                          <AppLogo
                            logoUrl={app.logoUrl}
                            alt={`${app.name} logo`}
                            className="size-11"
                          />
                          <div className="min-w-0">
                            <p className="font-medium">{app.name}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {app.category}
                            </p>
                          </div>
                        </div>
                        <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                          {app.description}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed text-center">
                    <div>
                      <p className="text-sm font-medium">No apps found</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Try a different search.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ComposeImportForm({
  onNext,
}: {
  onNext: (configuration: AppConfiguration) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState("")
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        try {
          onNext(appConfigurationFromCompose(source))
        } catch (parseError) {
          setError(parseError instanceof Error ? parseError.message : "Unable to read the Compose file.")
        }
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        <input
          ref={fileInput}
          type="file"
          accept=".yaml,.yml,application/yaml,text/yaml,text/x-yaml"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            void file.text().then((text) => {
              setSource(text)
              setError(null)
            }).catch(() => setError("Unable to read that file."))
            event.target.value = ""
          }}
        />
        <div
          className={`overflow-hidden rounded-xl border transition-colors ${
            dragging ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "bg-muted/10"
          }`}
          onDragEnter={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = "copy"
            setDragging(true)
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const file = event.dataTransfer.files[0]
            if (!file) return
            void file.text().then((text) => {
              setSource(text)
              setError(null)
            }).catch(() => setError("Unable to read that file."))
          }}
        >
          <div className="flex items-center justify-between gap-4 border-b bg-muted/30 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <FileUp className="size-4 shrink-0" />
              <span className="truncate">docker-compose.yaml</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => fileInput.current?.click()}
            >
              Choose file
            </Button>
          </div>
          <Textarea
            autoFocus
            aria-label="Docker Compose YAML"
            value={source}
            onChange={(event) => {
              setSource(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key !== "Tab") return
              event.preventDefault()
              const textarea = event.currentTarget
              const next = `${source.slice(0, textarea.selectionStart)}  ${source.slice(textarea.selectionEnd)}`
              const cursor = textarea.selectionStart + 2
              setSource(next)
              window.setTimeout(() => textarea.setSelectionRange(cursor, cursor))
            }}
            placeholder={"services:\n  app:\n    image: ghcr.io/example/app:latest\n    ports:\n      - \"8080:80\""}
            spellCheck={false}
            className="min-h-[22rem] resize-none rounded-none border-0 bg-transparent font-mono text-xs leading-5 shadow-none focus:border-transparent focus:ring-0"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Drop a .yaml or .yml file anywhere on the editor. One Compose service can be imported at a time.
        </p>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
      <div className="flex shrink-0 justify-end border-t bg-background px-5 py-4 sm:px-6">
        <Button type="submit" disabled={!source.trim()}>
          Next
        </Button>
      </div>
    </form>
  )
}

function ImportAppForm({
  containerId,
  domain,
  onCreated,
}: {
  containerId: string
  domain: string
  onCreated: (app: AppResource) => void
}) {
  const preview = useApi<AppConfiguration>(
    `/api/v1/container/${encodeURIComponent(containerId)}/import`
  )

  if (preview.status === "loading") {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        Loading container settings…
      </div>
    )
  }
  if (preview.status === "error") {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center text-center">
        <p className="font-medium">Unable to inspect the container</p>
        <p className="mt-1 text-sm text-muted-foreground">{preview.error}</p>
        <Button type="button" variant="outline" className="mt-4" onClick={preview.reload}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <CustomAppForm
      domain={domain}
      importContainerId={containerId}
      initialApp={preview.data}
      onSaved={onCreated}
    />
  )
}

function RegistryInstallForm({
  app,
  domain,
  onCreated,
  registryId,
}: {
  app: RegistryApp
  domain: string
  onCreated: (app: AppResource) => void
  registryId: string
}) {
  const [searchParams] = useSearchParams()
  const [subdomain, setSubdomain] = useState(registryId.toLowerCase())
  const [tls, setTls] = useState("only_https")
  const [port, setPort] = useState(String(app.port))
  const [networkMode, setNetworkMode] = useState(app.dockerNetworkMode || "bridge")
  const [dockerNetworks, setDockerNetworks] = useState<DockerNetworkAttachment[]>([])
  const [policyId, setPolicyId] = useState(searchParams.get("policyId") ?? "public")
  const [environment, setEnvironment] = useState(() =>
    environmentFromRecord(app.dockerEnvironment)
  )
  const [volumes, setVolumes] = useState(() => volumesFromRegistry(app.dockerVolumes))
  const [devices, setDevices] = useState(() =>
    volumesFromRegistry(app.dockerDevices ?? [])
  )
  const [ports, setPorts] = useState(() => portsFromDocker(app.dockerPorts))
  const [capabilities, setCapabilities] = useState(() =>
    capabilitiesFromValues(app.dockerCapabilities || [])
  )
  const [userId, setUserId] = useState(
    app.dockerUserId === null || app.dockerUserId === undefined
      ? ""
      : String(app.dockerUserId)
  )
  const [groupId, setGroupId] = useState(
    app.dockerGroupId === null || app.dockerGroupId === undefined
      ? ""
      : String(app.dockerGroupId)
  )
  const [privileged, setPrivileged] = useState(app.dockerPrivileged ?? false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const created = await apiRequest<AppResource>("/api/v1/app/registry", {
        method: "POST",
        body: JSON.stringify({
          registryId,
          subdomain,
          tls,
          port: Number(port),
          dockerNetworkMode: networkMode,
          dockerNetworks,
          policyId,
          dockerEnvironment: environmentToRecord(environment),
          dockerVolumes: volumesToBinds(volumes),
          dockerDevices: volumesToBinds(devices),
          dockerPorts: portsToDocker(ports),
          dockerUserId: userId === "" ? null : Number(userId),
          dockerGroupId: userId === "" || groupId === "" ? null : Number(groupId),
          dockerPrivileged: privileged,
          dockerCapabilities: capabilitiesToValues(capabilities),
        }),
      })
      onCreated(created)
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Install failed."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <form
        aria-busy={submitting}
        onSubmit={(event) => void submit(event)}
        className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden"
      >
      <fieldset disabled={submitting} className="contents">
        <div className="min-h-0 min-w-0 w-full max-w-full flex-1 overflow-x-hidden overflow-y-auto p-5 sm:p-6">
        <div className="min-w-0 max-w-full space-y-6">
          <div className="flex items-start gap-4 rounded-xl border bg-muted/20 p-4">
            <AppLogo
              logoUrl={app.logoUrl}
              alt={`${app.name} logo`}
              className="size-14"
            />
            <div className="min-w-0">
              <p className="font-medium">{app.name}</p>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {app.dockerImage}
              </p>
            </div>
          </div>

          <SubdomainField
            domain={domain}
            tls={tls}
            value={subdomain}
            onChange={setSubdomain}
            onTlsChange={setTls}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <PolicyField
              value={policyId}
              onChange={setPolicyId}
            />
            <FormField
              label={
                <span className="inline-flex items-center gap-1.5">
                  Internal Port
                  <InfoTooltip text="The internal HTTP port of the container, that will be mapped to the app's subdomain." />
                </span>
              }
            >
              <Input
                required
                type="number"
                min="1"
                max="65535"
                value={port}
                onChange={(event) => setPort(event.target.value)}
                placeholder="8080"
                className="appearance-none font-mono text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </FormField>
          </div>
          <NetworkEditor
            mode={networkMode}
            onModeChange={setNetworkMode}
            networks={dockerNetworks}
            onNetworksChange={setDockerNetworks}
            ports={ports}
            onPortsChange={setPorts}
          />
          <EnvironmentEditor value={environment} onChange={setEnvironment} />
          <VolumeEditor
            image={app.dockerImage}
            value={volumes}
            onChange={setVolumes}
          />
          <DeviceEditor value={devices} onChange={setDevices} />
          <CapabilityEditor
            privileged={privileged}
            onPrivilegedChange={setPrivileged}
            value={capabilities}
            onChange={setCapabilities}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="User ID">
              <Input
                type="number"
                min="0"
                step="1"
                value={userId}
                onChange={(event) => {
                  setUserId(event.target.value)
                  if (event.target.value === "") setGroupId("")
                }}
                placeholder="1000"
                className="appearance-none font-mono text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </FormField>
            <FormField label="Group ID">
              <Input
                type="number"
                min="0"
                step="1"
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
                placeholder="1000"
                disabled={userId === ""}
                className="appearance-none font-mono text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </FormField>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        </div>
        <div className="relative z-30 flex shrink-0 justify-end border-t bg-background px-5 py-4 sm:px-6">
          <Button type="submit">
            {submitting ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" />
            ) : (
              <Plus className="mr-2 size-4" />
            )}
            {submitting ? "Installing…" : `Install ${app.name}`}
          </Button>
        </div>
      </fieldset>
      {submitting && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-20 cursor-wait bg-background/70 backdrop-blur-[1px]"
        />
      )}
      </form>
    </>
  )
}

function CustomAppForm({
  app = null,
  domain,
  importContainerId = null,
  initialApp = null,
  onSaved,
}: {
  app?: AppResource | null
  domain: string
  importContainerId?: string | null
  initialApp?: AppConfiguration | null
  onSaved: (app: AppResource, dockerPropertiesChanged: boolean) => void
}) {
  const [searchParams] = useSearchParams()
  const editing = app !== null
  const importing = importContainerId !== null
  const defaults = app ?? initialApp
  const [name, setName] = useState(defaults?.name ?? "")
  const [subdomain, setSubdomain] = useState((defaults?.subdomain ?? "").toLowerCase())
  const [port, setPort] = useState(defaults?.port ? String(defaults.port) : "")
  const [tls, setTls] = useState(defaults?.tls ?? "only_https")
  const [dockerImage, setDockerImage] = useState(defaults?.dockerImage ?? "")
  const [networkMode, setNetworkMode] = useState<AppResource["dockerNetworkMode"]>(
    defaults?.dockerNetworkMode ?? "bridge"
  )
  const [dockerNetworks, setDockerNetworks] = useState<DockerNetworkAttachment[]>(
    defaults?.dockerNetworks ?? []
  )
  const [policyId, setPolicyId] = useState(
    defaults?.policyId ?? searchParams.get("policyId") ?? "public"
  )
  const [environment, setEnvironment] = useState<EnvironmentRow[]>(() =>
    environmentFromRecord(defaults?.dockerEnvironment ?? {})
  )
  const [volumes, setVolumes] = useState<VolumeRow[]>(() =>
    volumesFromRegistry(defaults?.dockerVolumes ?? [])
  )
  const [devices, setDevices] = useState<VolumeRow[]>(() =>
    volumesFromRegistry(defaults?.dockerDevices ?? [])
  )
  const [ports, setPorts] = useState<PortRow[]>(() =>
    portsFromDocker(defaults?.dockerPorts ?? [])
  )
  const [capabilities, setCapabilities] = useState<CapabilityRow[]>(() =>
    capabilitiesFromValues(defaults?.dockerCapabilities ?? [])
  )
  const [userId, setUserId] = useState(
    defaults?.dockerUserId === null || defaults?.dockerUserId === undefined
      ? ""
      : String(defaults.dockerUserId)
  )
  const [groupId, setGroupId] = useState(
    defaults?.dockerGroupId === null || defaults?.dockerGroupId === undefined
      ? ""
      : String(defaults.dockerGroupId)
  )
  const [privileged, setPrivileged] = useState(defaults?.dockerPrivileged ?? false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const saved = await apiRequest<AppResource>(
        importing
          ? `/api/v1/container/${encodeURIComponent(importContainerId)}/import`
          : editing
            ? `/api/v1/app/${app.id}`
            : "/api/v1/app",
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify({
            name,
            subdomain,
            port: port ? Number(port) : null,
            tls,
            dockerImage,
            dockerNetworkMode: networkMode,
            dockerNetworks,
            dockerVolumes: volumesToBinds(volumes),
            dockerDevices: volumesToBinds(devices),
            dockerPorts: portsToDocker(ports),
            dockerEnvironment: environmentToRecord(environment),
            dockerUserId: userId === "" ? null : Number(userId),
            dockerGroupId: userId === "" || groupId === "" ? null : Number(groupId),
            dockerPrivileged: privileged,
            dockerCapabilities: capabilitiesToValues(capabilities),
            policyId,
          }),
        }
      )
      onSaved(saved, editing && haveDockerPropertiesChanged(app, saved))
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          importing
            ? "Container import failed."
            : `App ${editing ? "update" : "creation"} failed.`
        )
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <form
        aria-busy={submitting}
        onSubmit={(event) => void submit(event)}
        className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden"
      >
      <fieldset disabled={submitting} className="contents">
        <div className="min-h-0 min-w-0 w-full max-w-full flex-1 overflow-x-hidden overflow-y-auto p-5 sm:p-6">
        <div className="min-w-0 max-w-full space-y-6">
          {importing && (
            <div className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                Importing replaces the existing container with an app-managed
                container and preserves whether it is running or stopped.
                Existing labels are not imported.
              </p>
            </div>
          )}
          <div className="grid min-w-0 max-w-full gap-4 sm:grid-cols-2">
        <FormField label="Name">
          <Input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="My App"
          />
        </FormField>
        <SubdomainField
          domain={domain}
          tls={tls}
          value={subdomain}
          onChange={setSubdomain}
          onTlsChange={setTls}
        />
        <PolicyField
          value={policyId}
          onChange={setPolicyId}
        />
        <FormField
          label={
            <span className="inline-flex items-center gap-1.5">
              Internal Port
              <InfoTooltip text="The internal HTTP port of the container, that will be mapped to the app's subdomain." />
            </span>
          }
        >
          <Input
            type="number"
            min="1"
            max="65535"
            value={port}
            onChange={(event) => setPort(event.target.value)}
            placeholder="8080"
            className="appearance-none font-mono text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </FormField>
          </div>
          <FormField label="Docker Image">
        <Input
          required
          value={dockerImage}
          onChange={(event) => setDockerImage(event.target.value)}
          placeholder="ghcr.io/example/app:latest"
          className="font-mono text-xs"
        />
          </FormField>
          <NetworkEditor
            mode={networkMode}
            onModeChange={setNetworkMode}
            networks={dockerNetworks}
            onNetworksChange={setDockerNetworks}
            ports={ports}
            onPortsChange={setPorts}
          />
          <EnvironmentEditor value={environment} onChange={setEnvironment} />
          <VolumeEditor
            image={dockerImage}
            value={volumes}
            onChange={setVolumes}
          />
          <DeviceEditor value={devices} onChange={setDevices} />
          <CapabilityEditor
            privileged={privileged}
            onPrivilegedChange={setPrivileged}
            value={capabilities}
            onChange={setCapabilities}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="User ID">
              <Input
                type="number"
                min="0"
                step="1"
                value={userId}
                onChange={(event) => {
                  setUserId(event.target.value)
                  if (event.target.value === "") setGroupId("")
                }}
                placeholder="1000"
                className="appearance-none font-mono text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </FormField>
            <FormField label="Group ID">
              <Input
                type="number"
                min="0"
                step="1"
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
                placeholder="1000"
                disabled={userId === ""}
                className="appearance-none font-mono text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </FormField>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        </div>
        <div className="relative z-30 flex shrink-0 justify-end border-t bg-background px-5 py-4 sm:px-6">
          {(editing || importing) && (
            <p className="mr-auto self-center text-xs text-muted-foreground">
              {importing
                ? "The old container is replaced when you import."
                : "Container changes require a restart."}
            </p>
          )}
          <Button type="submit">
            {submitting ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" />
            ) : importing ? (
              <PackagePlus className="mr-2 size-4" />
            ) : editing ? (
              <Save className="mr-2 size-4" />
            ) : (
              <Box className="mr-2 size-4" />
            )}
            {submitting
              ? importing
                ? "Importing…"
                : editing
                  ? "Saving…"
                  : "Creating…"
              : importing
                ? "Import"
                : editing
                  ? "Save"
                  : "Create"}
          </Button>
        </div>
      </fieldset>
      {submitting && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-20 cursor-wait bg-background/70 backdrop-blur-[1px]"
        />
      )}
      </form>
    </>
  )
}

function PolicyField({
  onChange,
  value,
}: {
  onChange: (value: string) => void
  value: string
}) {
  const policies = useApi<Record<string, PolicyResource>>("/api/v1/firewall/policy")
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [creatingPolicy, setCreatingPolicy] = useState(false)
  const [createdPolicy, setCreatedPolicy] = useState<PolicyResource | null>(null)

  useEffect(() => {
    if (!open) return
    function closeMenu(event: MouseEvent) {
      if (!menu.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return
      event.stopPropagation()
      setOpen(false)
    }
    document.addEventListener("mousedown", closeMenu)
    document.addEventListener("keydown", closeOnEscape, true)
    return () => {
      document.removeEventListener("mousedown", closeMenu)
      document.removeEventListener("keydown", closeOnEscape, true)
    }
  }, [open])

  const selectedPolicy = policies.status === "success"
    ? policies.data[value] ?? (createdPolicy?.id === value ? createdPolicy : null)
    : createdPolicy?.id === value ? createdPolicy : null

  return (
    <div className="block min-w-0 max-w-full space-y-1.5">
      <span className="block text-sm font-medium">Firewall Policy</span>
      <div ref={menu} className="relative">
        <button
          type="button"
          role="combobox"
          aria-label="Firewall Policy"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={policies.status !== "success"}
          onClick={() => setOpen(!open)}
          className="flex h-9 w-full cursor-pointer items-center justify-between rounded-lg border bg-background px-3 text-left text-sm shadow-xs outline-none focus:border-foreground/30 focus:ring-2 focus:ring-ring/30 disabled:cursor-default disabled:opacity-50"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selectedPolicy && (
              selectedPolicy.id === "public" ? (
                <Globe2 className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
              )
            )}
            <span className="truncate">{selectedPolicy?.name ?? "Loading policies…"}</span>
          </span>
          <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && policies.status === "success" && (
          <div className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-lg border bg-card p-1 text-card-foreground shadow-lg">
            <div role="listbox" aria-label="Firewall Policy" className="max-h-52 overflow-y-auto">
              {Object.values(policies.data).map((policy) => (
                <button
                  key={policy.id}
                  type="button"
                  role="option"
                  aria-selected={policy.id === value}
                  onClick={() => {
                    onChange(policy.id)
                    setOpen(false)
                  }}
                  className="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {policy.id === "public" ? (
                      <Globe2 className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{policy.name}</span>
                  </span>
                  {policy.id === value && <Check className="size-4" />}
                </button>
              ))}
            </div>
            <div className="mt-1 border-t pt-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setCreatingPolicy(true)
                }}
                className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                <Plus className="mr-2 size-4" />
                Create new Policy
              </button>
            </div>
          </div>
        )}
      </div>
      {creatingPolicy && (
        <FirewallPolicyDialog
          policy={null}
          onClose={() => setCreatingPolicy(false)}
          onSaved={(policy) => {
            setCreatingPolicy(false)
            setCreatedPolicy(policy)
            onChange(policy.id)
            policies.reload()
          }}
        />
      )}
    </div>
  )
}

function NetworkEditor({
  mode,
  onModeChange,
  networks,
  onNetworksChange,
  onPortsChange,
  ports,
}: {
  mode: AppResource["dockerNetworkMode"]
  onModeChange: (value: AppResource["dockerNetworkMode"]) => void
  networks: DockerNetworkAttachment[]
  onNetworksChange: (value: DockerNetworkAttachment[]) => void
  onPortsChange: (value: PortRow[]) => void
  ports: PortRow[]
}) {
  const availableNetworks = useApi<DockerNetworkResource[]>("/api/v1/network")
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [creatingNetwork, setCreatingNetwork] = useState(false)
  const selectedNetwork = mode === "host" ? "host" : networks[0]?.name ?? "bridge"
  const customNetworks = availableNetworks.status === "success"
    ? availableNetworks.data.filter((network) => network.driver === "bridge" && network.name !== "bridge" && !network.ingress)
    : []

  useEffect(() => {
    if (!open) return
    function closeMenu(event: MouseEvent) {
      if (!menu.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return
      event.stopPropagation()
      setOpen(false)
    }
    document.addEventListener("mousedown", closeMenu)
    document.addEventListener("keydown", closeOnEscape, true)
    return () => {
      document.removeEventListener("mousedown", closeMenu)
      document.removeEventListener("keydown", closeOnEscape, true)
    }
  }, [open])

  return (
    <>
    <section aria-label="Network" className="min-w-0 max-w-full rounded-xl border p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Network</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {mode === "host"
              ? "Uses the host network directly."
              : selectedNetwork === "bridge"
                ? "Connects the container to Docker's default bridge network."
                : `Connects the container to the ${selectedNetwork} bridge network.`}
          </p>
        </div>
        <div ref={menu} className="relative w-60 shrink-0">
          <button
            type="button"
            role="combobox"
            aria-label="Network mode"
            aria-expanded={open}
            aria-haspopup="listbox"
            onClick={() => setOpen(!open)}
            className="flex h-9 w-full cursor-pointer items-center justify-between rounded-lg border bg-background px-3 text-left text-sm shadow-xs outline-none focus:border-foreground/30 focus:ring-2 focus:ring-ring/30"
          >
            <span className="truncate">{selectedNetwork === "host" ? "Host" : selectedNetwork === "bridge" ? "Bridged — Default" : `Bridged — ${selectedNetwork}`}</span>
            <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>

          {open && (
            <div className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-lg border bg-card p-1 text-card-foreground shadow-lg">
              <div role="listbox" aria-label="Network mode" className="max-h-52 overflow-y-auto">
                {[
                  { value: "host", label: "Host" },
                  { value: "bridge", label: "Bridged — Default" },
                  ...customNetworks.map((network) => ({ value: network.name, label: `Bridged — ${network.name}` })),
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selectedNetwork === option.value}
                    onClick={() => {
                      if (option.value === "host") {
                        onModeChange("host")
                        onNetworksChange([])
                      } else {
                        onModeChange("bridge")
                        onNetworksChange(option.value === "bridge" ? [] : [{ name: option.value, aliases: [] }])
                      }
                      setOpen(false)
                    }}
                    className="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="truncate">{option.label}</span>
                    {selectedNetwork === option.value && <Check className="size-4 shrink-0" />}
                  </button>
                ))}
              </div>
              <div className="mt-1 border-t pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    setCreatingNetwork(true)
                  }}
                  className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  <Plus className="mr-2 size-4" />
                  Create new Network
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {mode !== "host" && (
        <div className="mt-4 border-t pt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Ports</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Publish a container TCP or UDP port on the host.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onPortsChange([
                  ...ports,
                  {
                    id: createRowId(),
                    host: "",
                    container: "",
                    protocol: "tcp",
                  },
                ])
              }
              className="h-8"
            >
              <Plus className="mr-1.5 size-3.5" />
              Add
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {ports.map((row) => (
              <EditorRow
                key={row.id}
                onRemove={() =>
                  onPortsChange(removeById(ports, row.id))
                }
                columns="grid-cols-[1fr_1fr_6rem_auto]"
              >
                <Input
                  type="number"
                  min="1"
                  max="65535"
                  value={row.host}
                  onChange={(event) =>
                    onPortsChange(
                      updateById(ports, row.id, { host: event.target.value })
                    )
                  }
                  placeholder="Host"
                  className="appearance-none font-mono text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <Input
                  type="number"
                  min="1"
                  max="65535"
                  value={row.container}
                  onChange={(event) =>
                    onPortsChange(
                      updateById(ports, row.id, {
                        container: event.target.value,
                      })
                    )
                  }
                  placeholder="Container"
                  className="appearance-none font-mono text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <Select
                  value={row.protocol}
                  onChange={(event) =>
                    onPortsChange(
                      updateById(ports, row.id, {
                        protocol: event.target.value as "tcp" | "udp",
                      })
                    )
                  }
                >
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </Select>
              </EditorRow>
            ))}
          </div>
        </div>
      )}
    </section>
    <NewNetworkDialog
      open={creatingNetwork}
      onClose={() => setCreatingNetwork(false)}
      onCreated={(network) => {
        setCreatingNetwork(false)
        availableNetworks.reload()
        onModeChange("bridge")
        onNetworksChange([{ name: network.name, aliases: [] }])
      }}
    />
    </>
  )
}

function SubdomainField({
  domain,
  onChange,
  onTlsChange,
  tls,
  value,
}: {
  domain: string
  onChange: (value: string) => void
  onTlsChange: (value: string) => void
  tls: string
  value: string
}) {
  const selectedTlsLabel =
    TLS_OPTIONS.find((option) => option.value === tls)?.label ??
    TLS_OPTIONS[0].label

  return (
    <div className="min-w-0 max-w-full sm:col-span-2">
      <FormField label="Subdomain">
        <div className="flex min-w-0 max-w-full overflow-hidden">
          <div className="relative shrink-0">
            <span
              aria-hidden="true"
              className="invisible block h-10 w-max whitespace-nowrap pr-11 pl-3 font-mono text-xs"
            >
              {selectedTlsLabel}
            </span>
            <Select
              value={tls}
              onChange={(event) => onTlsChange(event.target.value)}
              aria-label="TLS mode"
              className="absolute inset-0 h-10 appearance-none rounded-r-none pr-11 font-mono text-xs text-transparent [&>option]:text-foreground"
            >
              {TLS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.menuLabel}
                </option>
              ))}
            </Select>
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-xs">
              {selectedTlsLabel}
            </span>
            <ChevronDown
              className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <div className="flex h-10 min-w-0 flex-1 overflow-hidden rounded-r-lg border border-l-0 bg-background shadow-xs focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-ring/30">
            <Input
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              value={value}
              onChange={(event) => onChange(event.target.value.toLowerCase())}
              placeholder="my-app"
              className="h-full min-w-16 w-auto flex-1 rounded-none border-0 font-mono text-xs shadow-none focus:ring-0"
            />
            <span className="flex min-w-0 max-w-[calc(100%-4rem)] shrink-0 items-center border-l px-3 font-mono text-xs text-muted-foreground">
              <span className="truncate">.{domain}</span>
            </span>
          </div>
        </div>
      </FormField>
    </div>
  )
}

function EnvironmentEditor({
  onChange,
  value,
}: {
  onChange: (value: EnvironmentRow[]) => void
  value: EnvironmentRow[]
}) {
  return (
    <ListEditor
      title="Environment"
      hint="Environment variables passed to the container."
      onAdd={() => onChange([...value, { id: createRowId(), key: "", value: "" }])}
    >
      {value.map((row) => (
        <EditorRow key={row.id} onRemove={() => onChange(removeById(value, row.id))}>
          <Input
            value={row.key}
            onChange={(event) =>
              onChange(updateById(value, row.id, { key: event.target.value }))
            }
            placeholder="KEY"
            className="font-mono text-xs"
          />
          <Input
            required={row.valueRequired}
            value={row.value}
            onChange={(event) =>
              onChange(updateById(value, row.id, { value: event.target.value }))
            }
            placeholder="Value"
            className="font-mono text-xs"
          />
        </EditorRow>
      ))}
    </ListEditor>
  )
}

function VolumeEditor({
  image,
  onChange,
  value,
}: {
  image: string
  onChange: (value: VolumeRow[]) => void
  value: VolumeRow[]
}) {
  return (
    <ListEditor
      title="Volumes"
      hint="Bind a host path to a path inside the container."
      onAdd={() =>
        onChange([...value, { id: createRowId(), host: "", container: "" }])
      }
    >
      {value.map((row) => (
        <EditorRow key={row.id} onRemove={() => onChange(removeById(value, row.id))}>
          <PathAutocomplete
            required={row.hostRequired}
            value={row.host}
            onChange={(host) =>
              onChange(updateById(value, row.id, { host }))
            }
            placeholder="/host/path"
            source="host"
          />
          <PathAutocomplete
            required={row.containerRequired}
            value={row.container}
            onChange={(container) =>
              onChange(updateById(value, row.id, { container }))
            }
            placeholder="/container/path"
            source="image"
            image={image}
          />
        </EditorRow>
      ))}
    </ListEditor>
  )
}

function DeviceEditor({
  onChange,
  value,
}: {
  onChange: (value: VolumeRow[]) => void
  value: VolumeRow[]
}) {
  return (
    <ListEditor
      title="Devices"
      hint="Expose a host device inside the container."
      onAdd={() =>
        onChange([...value, { id: createRowId(), host: "", container: "" }])
      }
    >
      {value.map((row) => (
        <EditorRow key={row.id} onRemove={() => onChange(removeById(value, row.id))}>
          <PathAutocomplete
            required={row.hostRequired}
            value={row.host}
            onChange={(host) =>
              onChange(updateById(value, row.id, { host }))
            }
            placeholder="/dev/foo"
            source="device"
          />
          <PathAutocomplete
            required={row.containerRequired}
            value={row.container}
            onChange={(container) =>
              onChange(updateById(value, row.id, { container }))
            }
            placeholder="/dev/foo"
            source="device"
          />
        </EditorRow>
      ))}
    </ListEditor>
  )
}

function PathAutocomplete({
  image,
  onChange,
  placeholder,
  required,
  source,
  value,
}: {
  image?: string
  onChange: (value: string) => void
  placeholder: string
  required?: boolean
  source: "host" | "device" | "image"
  value: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const browserId = useId()
  const [open, setOpen] = useState(false)
  const [editingPath, setEditingPath] = useState(false)
  const [requestPath, setRequestPath] = useState("")
  const [entries, setEntries] = useState<
    Array<{ path: string; directory: boolean }>
  >([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [folderCreating, setFolderCreating] = useState(false)
  const [folderError, setFolderError] = useState("")

  const root = source === "device" ? "/dev/" : "/"
  const separator = requestPath.endsWith("/")
    ? requestPath.length - 1
    : requestPath.lastIndexOf("/")
  const currentDirectory = requestPath.endsWith("/")
    ? requestPath
    : `${requestPath.slice(0, separator + 1) || "/"}`
  const pathParts = currentDirectory.split("/").filter(Boolean)
  const atRoot = currentDirectory === root

  useEffect(() => {
    if (!open) {
      setEntries([])
      return
    }

    if (
      !requestPath.startsWith("/") ||
      (source === "device" && requestPath !== "/dev" && !requestPath.startsWith("/dev/")) ||
      (source === "image" && !image)
    ) {
      setEntries([])
      setLoading(false)
      setError(source === "image" && !image ? "Enter an image before browsing its files." : "Enter an absolute path.")
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError("")
    const timeout = window.setTimeout(() => {
      const query = new URLSearchParams({
        source,
        path: requestPath,
      })
      if (image) query.set("image", image)

      void apiRequest<Array<{ path: string; directory: boolean }>>(
        `/api/v1/container/paths?${query}`,
        { signal: controller.signal }
      )
        .then((result) => {
          setEntries(result)
          setLoading(false)
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return
          setEntries([])
          setLoading(false)
          setError("This location could not be opened.")
        })
    }, 150)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [image, open, requestPath, source])

  useEffect(() => {
    if (!open) return

    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopPropagation()
      if (editingPath) {
        setEditingPath(false)
        return
      }
      if (creatingFolder && !folderCreating) {
        setCreatingFolder(false)
        setNewFolderName("")
        setFolderError("")
        return
      }
      if (folderCreating) return
      setOpen(false)
    }

    document.addEventListener("keydown", closeOnEscape, true)
    return () => document.removeEventListener("keydown", closeOnEscape, true)
  }, [creatingFolder, editingPath, folderCreating, open])

  return (
    <div className="relative min-w-0">
      <Input
        ref={input}
        required={required}
        value={value}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? browserId : undefined}
        onChange={(event) => {
          onChange(event.target.value)
        }}
        onClick={() => {
          const nextPath = value || root
          setRequestPath(
            nextPath.endsWith("/")
              ? nextPath
              : `${nextPath.slice(0, nextPath.lastIndexOf("/") + 1) || root}`
          )
          setEditingPath(false)
          setCreatingFolder(false)
          setNewFolderName("")
          setFolderError("")
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (!['Enter', 'ArrowDown'].includes(event.key)) return
          event.preventDefault()
          const nextPath = value || root
          setRequestPath(
            nextPath.endsWith("/")
              ? nextPath
              : `${nextPath.slice(0, nextPath.lastIndexOf("/") + 1) || root}`
          )
          setEditingPath(false)
          setCreatingFolder(false)
          setNewFolderName("")
          setFolderError("")
          setOpen(true)
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="pr-9 font-mono text-xs"
      />
      <Folder className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
      {open && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !folderCreating) setOpen(false)
          }}
        >
          <div
            id={browserId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${browserId}-title`}
            className="relative flex h-[85vh] min-h-0 min-w-0 w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl sm:h-[70vh] sm:max-h-[38rem] sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id={`${browserId}-title`} className="font-semibold">
                  {source === "host" ? "Browse Host Files" : source === "device" ? "Browse devices" : "Browse Image Files"}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Choose a file or navigate to the folder you want to use.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={folderCreating}
                aria-label="Close file browser"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-5 sm:p-6">
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={atRoot}
                  aria-label="Go to parent folder"
                  onClick={() => {
                    const withoutTrailingSlash = currentDirectory.replace(/\/$/, "")
                    const parent = `${withoutTrailingSlash.slice(0, withoutTrailingSlash.lastIndexOf("/") + 1) || root}`
                    onChange(parent)
                    setRequestPath(parent)
                  }}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-xs hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                >
                  <ArrowUp className="size-4" />
                </button>
                {editingPath ? (
                  <Input
                    autoFocus
                    value={requestPath}
                    aria-label="Path"
                    onFocus={(event) => event.currentTarget.select()}
                    onBlur={() => setEditingPath(false)}
                    onChange={(event) => {
                      onChange(event.target.value)
                      setRequestPath(event.target.value)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return
                      event.preventDefault()
                      setEditingPath(false)
                    }}
                    className="font-mono text-xs"
                  />
                ) : (
                  <nav
                    aria-label="Current path"
                    title="Double-click to edit path"
                    onDoubleClick={() => setEditingPath(true)}
                    className="flex h-9 min-w-0 flex-1 cursor-text items-center overflow-x-auto rounded-lg border bg-background px-1 font-mono text-xs shadow-xs"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onChange(root)
                        setRequestPath(root)
                      }}
                      className="shrink-0 rounded px-2 py-1 hover:bg-muted"
                    >
                      {source === "device" ? "/dev" : "/"}
                    </button>
                    {pathParts.slice(source === "device" ? 1 : 0).map((part, index) => {
                      const leadingParts = source === "device" ? ["dev"] : []
                      const path = `/${[...leadingParts, ...pathParts.slice(source === "device" ? 1 : 0, index + 1)].join("/")}/`
                      return (
                        <span key={path} className="flex shrink-0 items-center">
                          <ChevronRight className="size-3 text-muted-foreground" />
                          <button
                            type="button"
                            onClick={() => {
                              onChange(path)
                              setRequestPath(path)
                            }}
                            className="rounded px-2 py-1 hover:bg-muted"
                          >
                            {part}
                          </button>
                        </span>
                      )
                    })}
                  </nav>
                )}
                {source === "host" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 shrink-0"
                    disabled={creatingFolder}
                    onClick={() => {
                      setCreatingFolder(true)
                      setNewFolderName("")
                      setFolderError("")
                    }}
                  >
                    <FolderPlus className="mr-1.5 size-4" />
                    New Folder
                  </Button>
                )}
              </div>

              <div className="mt-3 grid shrink-0 grid-cols-[minmax(0,1fr)_5rem_1.5rem] gap-3 border-b px-3 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                <span>Name</span>
                <span>Type</span>
                <span />
              </div>

              <div role="listbox" aria-label="Files and folders" className="min-h-0 flex-1 overflow-y-auto py-1.5">
                {loading ? (
                  <div className="flex h-full min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" />
                    Loading files…
                  </div>
                ) : error ? (
                  <div className="flex h-full min-h-32 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                    {error}
                  </div>
                ) : entries.length === 0 ? (
                  <div className="flex h-full min-h-32 items-center justify-center text-sm text-muted-foreground">
                    This folder is empty.
                  </div>
                ) : entries.map((entry) => {
                  const name = entry.path.replace(/\/$/, "").split("/").pop() || "/"
                  return (
                    <button
                      key={entry.path}
                      type="button"
                      role="option"
                      aria-selected={entry.path === value}
                      onClick={() => {
                        onChange(entry.path)
                        if (entry.directory) {
                          setRequestPath(entry.path)
                        } else {
                          setOpen(false)
                        }
                      }}
                      className="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_5rem_1.5rem] items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-accent hover:text-accent-foreground aria-selected:bg-accent/70"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        {entry.directory ? (
                          <Folder className="size-4 shrink-0 fill-current text-amber-500" />
                        ) : (
                          <File className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate font-mono text-xs">{name}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">{entry.directory ? "Folder" : "File"}</span>
                      {entry.directory ? <ChevronRight className="size-4 text-muted-foreground" /> : <span />}
                    </button>
                  )
                })}
              </div>
            </div>

            {source === "host" && creatingFolder && (
              <div
                className="absolute inset-0 z-20 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
                onMouseDown={(event) => {
                  if (event.target !== event.currentTarget || folderCreating) return
                  setCreatingFolder(false)
                  setNewFolderName("")
                  setFolderError("")
                }}
              >
                <form
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={`${browserId}-new-folder-title`}
                  onSubmit={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    const directoryName = newFolderName.trim()
                    if (!directoryName || ['.', '..'].includes(directoryName) || directoryName.includes('/')) {
                      setFolderError("Enter a valid folder name.")
                      return
                    }
                    setFolderCreating(true)
                    setFolderError("")
                    void apiRequest<{ path: string; directory: true }>("/api/v1/container/paths", {
                      method: "POST",
                      body: JSON.stringify({
                        parentPath: currentDirectory,
                        directoryName,
                      }),
                    })
                      .then((created) => {
                        onChange(created.path)
                        setRequestPath(created.path)
                        setCreatingFolder(false)
                        setNewFolderName("")
                      })
                      .catch((requestError) => {
                        setFolderError(requestError instanceof Error ? requestError.message : "Folder could not be created.")
                      })
                      .finally(() => setFolderCreating(false))
                  }}
                  className="flex min-w-0 w-full max-w-md flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl sm:rounded-2xl"
                >
                  <div className="flex items-center justify-between border-b px-5 py-4">
                    <h3 id={`${browserId}-new-folder-title`} className="font-semibold">New Folder</h3>
                    <button
                      type="button"
                      disabled={folderCreating}
                      aria-label="Close new folder dialog"
                      onClick={() => {
                        setCreatingFolder(false)
                        setNewFolderName("")
                        setFolderError("")
                      }}
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="p-5">
                    <div className="flex h-10 min-w-0 overflow-hidden rounded-lg border bg-background shadow-xs focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-ring/30">
                      <span
                        title={currentDirectory}
                        className="flex min-w-0 max-w-[60%] shrink-0 items-center border-r bg-muted/30 px-3 font-mono text-xs text-muted-foreground"
                      >
                        <span className="truncate">{currentDirectory}</span>
                      </span>
                      <Input
                        id={`${browserId}-folder-name`}
                        autoFocus
                        required
                        aria-label="Folder name"
                        value={newFolderName}
                        disabled={folderCreating}
                        onChange={(event) => setNewFolderName(event.target.value)}
                        placeholder="New folder"
                        className="h-full min-w-16 flex-1 rounded-none border-0 font-mono text-xs shadow-none focus:ring-0"
                      />
                    </div>
                    {folderError && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{folderError}</p>}
                  </div>
                  <div className="flex justify-end gap-2 border-t px-5 py-4">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={folderCreating}
                      onClick={() => {
                        setCreatingFolder(false)
                        setNewFolderName("")
                        setFolderError("")
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={folderCreating || !newFolderName.trim()}>
                      {folderCreating && <LoaderCircle className="mr-2 size-4 animate-spin" />}
                      Create Folder
                    </Button>
                  </div>
                </form>
              </div>
            )}

            <div className="flex shrink-0 items-center justify-between gap-4 border-t bg-background px-5 py-4 sm:px-6">
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                {currentDirectory}
              </span>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" disabled={folderCreating} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    onChange(currentDirectory)
                    setOpen(false)
                  }}
                >
                  Select folder
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function CapabilityEditor({
  onChange,
  onPrivilegedChange,
  privileged,
  value,
}: {
  onChange: (value: CapabilityRow[]) => void
  onPrivilegedChange: (value: boolean) => void
  privileged: boolean
  value: CapabilityRow[]
}) {
  return (
    <section
      aria-label="Container privileges"
      className="min-w-0 max-w-full rounded-xl border p-4"
    >
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={privileged}
          onChange={(event) => onPrivilegedChange(event.target.checked)}
          className="size-4 rounded border"
        />
        <span className="inline-flex items-center gap-1.5">
          Run container in privileged mode
          <InfoTooltip text="Privileged mode gives the container nearly unrestricted access to host devices and kernel capabilities. Only enable it for images you trust." />
        </span>
      </label>

      {!privileged && (
        <div className="mt-4 border-t pt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Capabilities</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Grant specific Linux capabilities to the container.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onChange([
                  ...value,
                  { id: createRowId(), value: "CAP_NET_ADMIN" },
                ])
              }
              className="h-8"
            >
              <Plus className="mr-1.5 size-3.5" />
              Add
            </Button>
          </div>
          {value.length > 0 && (
            <div className="mt-3 space-y-2">
              {value.map((row) => (
                <EditorRow
                  key={row.id}
                  onRemove={() => onChange(removeById(value, row.id))}
                  columns="grid-cols-[1fr_auto]"
                >
                  <Select
                    value={row.value}
                    onChange={(event) =>
                      onChange(
                        updateById(value, row.id, {
                          value: event.target.value,
                        })
                      )
                    }
                    className="font-mono text-xs"
                  >
                    {LINUX_CAPABILITIES.map((capability) => (
                      <option key={capability} value={capability}>
                        {capability}
                      </option>
                    ))}
                  </Select>
                </EditorRow>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function ListEditor({
  children,
  hint,
  onAdd,
  title,
}: {
  children: ReactNode
  hint: string
  onAdd: () => void
  title: string
}) {
  return (
    <fieldset
      className={`min-w-0 max-w-full rounded-xl border px-4 ${Children.count(children) > 0 ? "space-y-3 py-4" : "py-3"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <legend className="text-sm font-medium">{title}</legend>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
        <Button type="button" variant="outline" onClick={onAdd} className="h-8">
          <Plus className="mr-1.5 size-3.5" />
          Add
        </Button>
      </div>
      {Children.count(children) > 0 ? (
        <div className="space-y-2">{children}</div>
      ) : null}
    </fieldset>
  )
}

function EditorRow({
  children,
  columns = "grid-cols-[1fr_1fr_auto]",
  onRemove,
}: {
  children: ReactNode
  columns?: string
  onRemove: () => void
}) {
  return (
    <div className={`grid min-w-0 max-w-full items-center gap-2 ${columns}`}>
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove row"
        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
      >
        <Minus className="size-4" />
      </button>
    </div>
  )
}

function FormField({
  children,
  hint,
  label,
}: {
  children: ReactNode
  hint?: string
  label: ReactNode
}) {
  return (
    <label className="block min-w-0 max-w-full space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span
      className="group relative inline-flex text-muted-foreground"
      tabIndex={0}
      aria-label={text}
    >
      <Info className="size-3.5" aria-hidden="true" />
      <span
        role="tooltip"
        className="invisible absolute top-full left-0 z-20 mt-2 w-72 rounded-lg bg-foreground px-3 py-2 text-xs leading-relaxed font-normal text-background opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100"
      >
        {text}
      </span>
    </span>
  )
}

function LoadingRegistry() {
  return (
    <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
      <LoaderCircle className="mr-2 size-4 animate-spin" />
      Loading registry…
    </div>
  )
}

function RegistryError({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center text-center">
      <p className="font-medium">Unable to load the registry</p>
      <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      <Button type="button" variant="outline" className="mt-4" onClick={retry}>
        Try again
      </Button>
    </div>
  )
}

function getErrorMessage(error: unknown, fallback = "Request failed.") {
  return error instanceof Error ? error.message : fallback
}

function environmentFromRecord(value: Record<string, string>): EnvironmentRow[] {
  return Object.entries(value).map(([key, environmentValue]) => ({
    id: createRowId(),
    key,
    value:
      environmentValue === "$REQUIRED"
        ? ""
        : resolveEnvironmentValue(environmentValue),
    valueRequired: environmentValue === "$REQUIRED",
  }))
}

function environmentToRecord(value: EnvironmentRow[]) {
  return Object.fromEntries(
    value
      .filter((row) => row.key.trim())
      .map((row) => [row.key.trim(), resolveEnvironmentValue(row.value)])
  )
}

function resolveEnvironmentValue(value: string) {
  if (value !== "$TIMEZONE") return value

  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

function volumesFromRegistry(value: Record<string, string> | string[]): VolumeRow[] {
  if (!Array.isArray(value)) {
    return Object.entries(value).map(([host, container]) => ({
      id: createRowId(),
      host: host === "$REQUIRED" ? "" : host,
      container: container === "$REQUIRED" ? "" : container,
      hostRequired: host === "$REQUIRED",
      containerRequired: container === "$REQUIRED",
    }))
  }

  return value.map((bind) => {
    const separator = bind.indexOf(":")
    const host = separator < 0 ? bind : bind.slice(0, separator)
    const container = separator < 0 ? "" : bind.slice(separator + 1)
    return {
      id: createRowId(),
      host: host === "$REQUIRED" ? "" : host,
      container: container === "$REQUIRED" ? "" : container,
      hostRequired: host === "$REQUIRED",
      containerRequired: container === "$REQUIRED",
    }
  })
}

function volumesToBinds(value: VolumeRow[]) {
  return value
    .filter((row) => row.host.trim() && row.container.trim())
    .map((row) => `${row.host.trim()}:${row.container.trim()}`)
}

function portsFromDocker(value: DockerPort[]): PortRow[] {
  return value.map((port) => ({
    id: createRowId(),
    host: String(port.host),
    hostIp: port.hostIp,
    container: String(port.container),
    protocol: port.protocol,
  }))
}

function portsToDocker(value: PortRow[]): DockerPort[] {
  return value
    .filter((row) => row.host && row.container)
    .map((row) => ({
      host: Number(row.host),
      ...(row.hostIp ? { hostIp: row.hostIp } : {}),
      container: Number(row.container),
      protocol: row.protocol,
    }))
}

function capabilitiesFromValues(value: string[]): CapabilityRow[] {
  return value.map((capability) => ({ id: createRowId(), value: capability }))
}

function capabilitiesToValues(value: CapabilityRow[]) {
  return value.map((row) => row.value).filter(Boolean)
}

function haveDockerPropertiesChanged(
  before: AppResource,
  after: AppResource
) {
  return (
    before.subdomain !== after.subdomain ||
    before.dockerImage !== after.dockerImage ||
    before.dockerNetworkMode !== after.dockerNetworkMode ||
    JSON.stringify(before.dockerNetworks) !== JSON.stringify(after.dockerNetworks) ||
    before.dockerUserId !== after.dockerUserId ||
    before.dockerGroupId !== after.dockerGroupId ||
    before.dockerPrivileged !== after.dockerPrivileged ||
    JSON.stringify(before.dockerVolumes) !== JSON.stringify(after.dockerVolumes) ||
    JSON.stringify(before.dockerDevices) !== JSON.stringify(after.dockerDevices) ||
    JSON.stringify(before.dockerPorts) !== JSON.stringify(after.dockerPorts) ||
    JSON.stringify(before.dockerCapabilities) !==
      JSON.stringify(after.dockerCapabilities) ||
    JSON.stringify(
      Object.entries(before.dockerEnvironment).sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ) !==
      JSON.stringify(
        Object.entries(after.dockerEnvironment).sort(([left], [right]) =>
          left.localeCompare(right)
        )
      )
  )
}

function removeById<T extends { id: string }>(value: T[], id: string) {
  return value.filter((row) => row.id !== id)
}

function updateById<T extends { id: string }>(
  value: T[],
  id: string,
  patch: Partial<T>
) {
  return value.map((row) => (row.id === id ? { ...row, ...patch } : row))
}
