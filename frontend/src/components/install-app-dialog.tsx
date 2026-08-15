import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import {
  ArrowLeft,
  Box,
  Check,
  ChevronDown,
  Info,
  LoaderCircle,
  Minus,
  Plus,
  Save,
  Search,
  X,
} from "lucide-react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"

import { AppLogo } from "@/components/app-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { useApi } from "@/hooks/use-api"
import { apiRequest } from "@/lib/api"
import { TLS_OPTIONS } from "@/lib/tls"
import type { AppResource, DockerPort, PolicyResource, RegistryApp } from "@/lib/types"

type DialogProps = {
  onClose: () => void
  onCreated: (app: AppResource) => void
  open: boolean
}

type EnvironmentRow = { id: string; key: string; value: string }
type VolumeRow = { id: string; host: string; container: string }
type PortRow = {
  id: string
  host: string
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
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6">
          <div>
            <h2 id="edit-app-title" className="font-semibold">
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
  const [mode, setMode] = useState<"registry" | "custom">(
    searchParams.get("mode") === "custom" ? "custom" : "registry"
  )
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
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border bg-background shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            {selected && (
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-lg hover:bg-muted"
                onClick={() => setSelected(null)}
                aria-label="Back to registry"
              >
                <ArrowLeft className="size-4" />
              </button>
            )}
            <div>
              <h2 id="install-app-title" className="font-semibold">
                {selected ? `Install ${selected.app.name}` : "Add an app"}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {selected
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

        {!selected && (
          <div className="border-b px-5 pt-3 sm:px-6">
            <div className="flex gap-5">
              {(["registry", "custom"] as const).map((option) => (
                <button
                  type="button"
                  key={option}
                  onClick={() => setMode(option)}
                  className={`border-b-2 px-0.5 pb-3 text-sm font-medium capitalize transition-colors ${
                    mode === option
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}

        {selected ? (
          <RegistryInstallForm
            registryId={selected.id}
            app={selected.app}
            domain={domain}
            onCreated={onCreated}
          />
        ) : mode === "custom" ? (
          <CustomAppForm domain={domain} onSaved={onCreated} />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
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
                            registryId={id}
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
  const [subdomain, setSubdomain] = useState(registryId)
  const [tls, setTls] = useState("only_https")
  const [networkMode, setNetworkMode] = useState(app.dockerNetworkMode || "bridge")
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
          dockerNetworkMode: networkMode,
          policyId,
          dockerEnvironment: environmentToRecord(environment),
          dockerVolumes: volumesToBinds(volumes),
          dockerDevices: volumesToBinds(devices),
          dockerPorts: portsToDocker(ports),
          dockerCapabilities: capabilitiesToValues(capabilities),
        }),
      })
      onCreated(created)
      void startApp(created).catch(() => {})
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Install failed."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <form
      onSubmit={(event) => void submit(event)}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="space-y-6">
          <div className="flex items-start gap-4 rounded-xl border bg-muted/20 p-4">
            <AppLogo
              registryId={registryId}
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
          <PolicyField
            value={policyId}
            onChange={setPolicyId}
            allowCreate
            createReturnTo={`/apps?new=1&registryId=${encodeURIComponent(registryId)}`}
          />
          <NetworkEditor
            mode={networkMode}
            onModeChange={setNetworkMode}
            ports={ports}
            onPortsChange={setPorts}
          />
          <EnvironmentEditor value={environment} onChange={setEnvironment} />
          <VolumeEditor value={volumes} onChange={setVolumes} />
          <DeviceEditor value={devices} onChange={setDevices} />
          <CapabilityEditor value={capabilities} onChange={setCapabilities} />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
      <div className="flex shrink-0 justify-end border-t bg-background px-5 py-4 sm:px-6">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <LoaderCircle className="mr-2 size-4 animate-spin" />
          ) : (
            <Plus className="mr-2 size-4" />
          )}
          {submitting ? "Installing…" : `Install ${app.name}`}
        </Button>
      </div>
      </form>
    </>
  )
}

function CustomAppForm({
  app = null,
  domain,
  onSaved,
}: {
  app?: AppResource | null
  domain: string
  onSaved: (app: AppResource, dockerPropertiesChanged: boolean) => void
}) {
  const [searchParams] = useSearchParams()
  const editing = app !== null
  const [name, setName] = useState(app?.name ?? "")
  const [subdomain, setSubdomain] = useState(app?.subdomain ?? "")
  const [port, setPort] = useState(app?.port ? String(app.port) : "")
  const [tls, setTls] = useState(app?.tls ?? "only_https")
  const [dockerImage, setDockerImage] = useState(app?.dockerImage ?? "")
  const [networkMode, setNetworkMode] = useState<AppResource["dockerNetworkMode"]>(
    app?.dockerNetworkMode ?? "bridge"
  )
  const [policyId, setPolicyId] = useState(
    app?.policyId ?? searchParams.get("policyId") ?? "public"
  )
  const [environment, setEnvironment] = useState<EnvironmentRow[]>(() =>
    environmentFromRecord(app?.dockerEnvironment ?? {})
  )
  const [volumes, setVolumes] = useState<VolumeRow[]>(() =>
    volumesFromRegistry(app?.dockerVolumes ?? [])
  )
  const [devices, setDevices] = useState<VolumeRow[]>(() =>
    volumesFromRegistry(app?.dockerDevices ?? [])
  )
  const [ports, setPorts] = useState<PortRow[]>(() =>
    portsFromDocker(app?.dockerPorts ?? [])
  )
  const [capabilities, setCapabilities] = useState<CapabilityRow[]>(() =>
    capabilitiesFromValues(app?.dockerCapabilities ?? [])
  )
  const [privileged, setPrivileged] = useState(app?.dockerPrivileged ?? false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const saved = await apiRequest<AppResource>(
        editing ? `/api/v1/app/${app.id}` : "/api/v1/app",
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify({
            name,
            subdomain,
            port: port ? Number(port) : null,
            tls,
            dockerImage,
            dockerNetworkMode: networkMode,
            dockerVolumes: volumesToBinds(volumes),
            dockerDevices: volumesToBinds(devices),
            dockerPorts: portsToDocker(ports),
            dockerEnvironment: environmentToRecord(environment),
            dockerPrivileged: privileged,
            dockerCapabilities: capabilitiesToValues(capabilities),
            policyId,
          }),
        }
      )
      onSaved(saved, editing && haveDockerPropertiesChanged(app, saved))
      if (!editing) void startApp(saved).catch(() => {})
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          `App ${editing ? "update" : "creation"} failed.`
        )
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <form
      onSubmit={(event) => void submit(event)}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
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
          allowCreate
          createReturnTo={editing ? undefined : "/apps?new=1&mode=custom"}
        />
        <FormField
          label={
            <span className="inline-flex items-center gap-1.5">
              Port
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
          <FormField label="Docker image">
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
            ports={ports}
            onPortsChange={setPorts}
          />
          <EnvironmentEditor value={environment} onChange={setEnvironment} />
          <VolumeEditor value={volumes} onChange={setVolumes} />
          <DeviceEditor value={devices} onChange={setDevices} />
          <CapabilityEditor value={capabilities} onChange={setCapabilities} />
          <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={privileged}
          onChange={(event) => setPrivileged(event.target.checked)}
          className="size-4 rounded border"
        />
        Run container in privileged mode
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
      <div className="flex shrink-0 justify-end border-t bg-background px-5 py-4 sm:px-6">
        {editing && (
          <p className="mr-auto self-center text-xs text-muted-foreground">
            Container changes require a restart.
          </p>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <LoaderCircle className="mr-2 size-4 animate-spin" />
          ) : editing ? (
            <Save className="mr-2 size-4" />
          ) : (
            <Box className="mr-2 size-4" />
          )}
          {submitting
            ? editing
              ? "Saving…"
              : "Creating…"
            : editing
              ? "Save"
              : "Create"}
        </Button>
      </div>
      </form>
    </>
  )
}

function PolicyField({
  allowCreate = false,
  createReturnTo,
  onChange,
  value,
}: {
  allowCreate?: boolean
  createReturnTo?: string
  onChange: (value: string) => void
  value: string
}) {
  const policies = useApi<Record<string, PolicyResource>>("/api/v1/firewall/policy")
  const navigate = useNavigate()
  const location = useLocation()
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function closeMenu(event: MouseEvent) {
      if (!menu.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", closeMenu)
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("mousedown", closeMenu)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  const selectedPolicy = policies.status === "success" ? policies.data[value] : null

  return (
    <FormField label="Firewall policy">
      <div ref={menu} className="relative">
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={policies.status !== "success"}
          onClick={() => setOpen(!open)}
          className="flex h-9 w-full cursor-pointer items-center justify-between rounded-lg border bg-background px-3 text-left text-sm shadow-xs outline-none focus:border-foreground/30 focus:ring-2 focus:ring-ring/30 disabled:cursor-default disabled:opacity-50"
        >
          <span>{selectedPolicy?.name ?? "Loading policies…"}</span>
          <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && policies.status === "success" && (
          <div className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-lg border bg-card p-1 text-card-foreground shadow-lg">
            <div role="listbox" aria-label="Firewall policy" className="max-h-52 overflow-y-auto">
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
                  {policy.name}
                  {policy.id === value && <Check className="size-4" />}
                </button>
              ))}
            </div>
            {allowCreate && (
              <div className="mt-1 border-t pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    navigate(`/firewall?new=1&returnTo=${encodeURIComponent(createReturnTo ?? location.pathname)}`)
                  }}
                  className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  <Plus className="mr-2 size-4" />
                  Create new Policy
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </FormField>
  )
}

function NetworkEditor({
  mode,
  onModeChange,
  onPortsChange,
  ports,
}: {
  mode: AppResource["dockerNetworkMode"]
  onModeChange: (value: AppResource["dockerNetworkMode"]) => void
  onPortsChange: (value: PortRow[]) => void
  ports: PortRow[]
}) {
  return (
    <section aria-label="Network" className="rounded-xl border p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Network</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {mode === "host"
              ? "Uses the host network directly."
              : "Connects the container to Containarr's private network."}
          </p>
        </div>
        <div className="relative w-36 shrink-0">
          <Select
            aria-label="Network mode"
            value={mode}
            onChange={(event) =>
              onModeChange(
                event.target.value as AppResource["dockerNetworkMode"]
              )
            }
            className="appearance-none pr-10"
          >
            <option value="bridge">Bridge</option>
            <option value="host">Host</option>
          </Select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
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
    <div className="sm:col-span-2">
      <FormField label="Subdomain">
        <div className="flex">
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
          <div className="flex h-10 min-w-0 flex-1 rounded-r-lg border border-l-0 bg-background shadow-xs focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-ring/30">
            <Input
              required
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="my-app"
              className="h-full min-w-0 rounded-none border-0 font-mono text-xs shadow-none focus:ring-0"
            />
            <span className="flex shrink-0 items-center whitespace-nowrap border-l px-3 font-mono text-xs text-muted-foreground">
              .{domain}
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
  onChange,
  value,
}: {
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
          <Input
            value={row.host}
            onChange={(event) =>
              onChange(updateById(value, row.id, { host: event.target.value }))
            }
            placeholder="/host/path"
            className="font-mono text-xs"
          />
          <Input
            value={row.container}
            onChange={(event) =>
              onChange(
                updateById(value, row.id, { container: event.target.value })
              )
            }
            placeholder="/container/path"
            className="font-mono text-xs"
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
          <Input
            value={row.host}
            onChange={(event) =>
              onChange(updateById(value, row.id, { host: event.target.value }))
            }
            placeholder="/dev/foo"
            className="font-mono text-xs"
          />
          <Input
            value={row.container}
            onChange={(event) =>
              onChange(
                updateById(value, row.id, { container: event.target.value })
              )
            }
            placeholder="/dev/foo"
            className="font-mono text-xs"
          />
        </EditorRow>
      ))}
    </ListEditor>
  )
}

function CapabilityEditor({
  onChange,
  value,
}: {
  onChange: (value: CapabilityRow[]) => void
  value: CapabilityRow[]
}) {
  return (
    <ListEditor
      title="Capabilities"
      hint="Grant specific Linux capabilities to the container."
      onAdd={() =>
        onChange([...value, { id: createRowId(), value: "CAP_NET_ADMIN" }])
      }
    >
      {value.map((row) => (
        <EditorRow
          key={row.id}
          onRemove={() => onChange(removeById(value, row.id))}
          columns="grid-cols-[1fr_auto]"
        >
          <Select
            value={row.value}
            onChange={(event) =>
              onChange(updateById(value, row.id, { value: event.target.value }))
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
    </ListEditor>
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
    <fieldset className="space-y-3 rounded-xl border p-4">
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
      <div className="space-y-2">{children}</div>
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
    <div className={`grid items-center gap-2 ${columns}`}>
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
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
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

async function startApp(app: AppResource) {
  await apiRequest(`/api/v1/app/${app.id}/start`, { method: "POST" })
}

function getErrorMessage(error: unknown, fallback = "Request failed.") {
  return error instanceof Error ? error.message : fallback
}

function environmentFromRecord(value: Record<string, string>): EnvironmentRow[] {
  return Object.entries(value).map(([key, environmentValue]) => ({
    id: createRowId(),
    key,
    value: resolveEnvironmentValue(environmentValue),
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
      host,
      container,
    }))
  }

  return value.map((bind) => {
    const separator = bind.indexOf(":")
    return {
      id: createRowId(),
      host: separator < 0 ? bind : bind.slice(0, separator),
      container: separator < 0 ? "" : bind.slice(separator + 1),
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
    container: String(port.container),
    protocol: port.protocol,
  }))
}

function portsToDocker(value: PortRow[]): DockerPort[] {
  return value
    .filter((row) => row.host && row.container)
    .map((row) => ({
      host: Number(row.host),
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
    before.dockerImage !== after.dockerImage ||
    before.dockerNetworkMode !== after.dockerNetworkMode ||
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
