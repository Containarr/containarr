import { useEffect, useRef, useState, type FormEvent } from "react"
import { Bell, Braces, Check, ChevronLeft, ChevronRight, LoaderCircle, Pencil, Play, Plus, Trash2, X } from "lucide-react"
import { Link, useSearchParams } from "react-router-dom"

import { PageHeader } from "@/components/page-header"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { SortableTableHeader, type SortDirection } from "@/components/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useApi } from "@/hooks/use-api"
import { apiRequest } from "@/lib/api"

type EventLog = {
  events: { id: string; eventName: string; message: string; appId: string | null; appName: string | null; createdAt: string; details?: Record<string, unknown> & { test?: boolean } }[]
  total: number
  page: number
  pageSize: number
  debugApp?: { id: string; name: string } | null
}
type Destination = { id: string; name: string; createdAt: string; lastSentAt: string | null; lastError: string | null }
type Destinations = { publicKey: string; devices: Destination[]; webhooks: (Destination & { url: string })[] }
type Editor = { kind: "device" | "webhook"; id?: string } | { kind: "instructions"; message: string }

const payloadExamples = [
  { eventName: "app.update_available", appId: "plex-app-id", appName: "Plex", message: "Plex has an update available.", details: { dockerImage: "plexinc/pms-docker:latest", imageId: "sha256:…" } },
  { eventName: "app.updated", appId: "plex-app-id", appName: "Plex", message: "Plex has been updated.", details: { dockerImage: "plexinc/pms-docker:latest", imageId: "sha256:…" } },
  { eventName: "app.offline", appId: "immich-app-id", appName: "Immich", message: "Immich has gone offline.", details: { offlineSince: "2026-09-04T11:55:00.000Z" } },
  { eventName: "app.online", appId: "immich-app-id", appName: "Immich", message: "Immich is back online.", details: { offlineSince: "2026-09-04T11:50:00.000Z", durationSeconds: 600 } },
  { eventName: "containarr.update_available", appId: null, appName: null, message: "Containarr has an update available: v1.2.3.", details: { version: "1.2.3", currentVersion: "1.2.2" } },
  { eventName: "containarr.updated", appId: null, appName: null, message: "Containarr has been updated to v1.2.3.", details: { version: "1.2.3", previousVersion: "1.2.2" } },
  { eventName: "containarr.test", appId: null, appName: null, message: "This is a test event from Containarr.", details: { test: true } },
]

export function EventsPage() {
  const [searchParams] = useSearchParams()
  const dev = searchParams.get("dev") === "1" || new URLSearchParams(window.location.search).get("dev") === "1"
  const [page, setPage] = useState(1)
  const [eventSort, setEventSort] = useState<{ key: "createdAt" | "message"; direction: SortDirection }>({ key: "createdAt", direction: "desc" })
  const [deviceSort, setDeviceSort] = useState<{ key: "name" | "createdAt" | "lastSentAt"; direction: SortDirection }>({ key: "name", direction: "asc" })
  const [webhookSort, setWebhookSort] = useState<{ key: "name" | "url" | "lastSentAt"; direction: SortDirection }>({ key: "name", direction: "asc" })
  const events = useApi<EventLog>(`/api/v1/event?page=${page}&sortBy=${eventSort.key}&direction=${eventSort.direction}${dev ? "&dev=1" : ""}`, { pollInterval: 15_000 })
  const debugApp = events.status === "success" ? events.data.debugApp : null
  const destinations = useApi<Destinations>("/api/v1/event/destinations", { pollInterval: 15_000 })
  const [editor, setEditor] = useState<Editor | null>(null)
  const [payloadEvent, setPayloadEvent] = useState<EventLog["events"][number] | null>(null)
  const [payloadExample, setPayloadExample] = useState(0)
  const payloadDialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [pending, setPending] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [creatingDebugEvent, setCreatingDebugEvent] = useState<string | null>(null)
  const [debugError, setDebugError] = useState<string | null>(null)
  const [testSent, setTestSent] = useState<Set<string>>(new Set())
  const [testErrors, setTestErrors] = useState<Record<string, string>>({})
  const testTimers = useRef<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<{ kind: "event" | "device" | "webhook"; id: string; name: string } | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(() => {
    try { return localStorage.getItem("containarr-push-device") } catch { return null }
  })
  const dialog = useRef<HTMLDialogElement>(null)
  const currentDeviceRegistered = destinations.status === "success"
    && destinations.data.devices.some(device => device.id === currentDeviceId)
  const devices = destinations.status === "success" ? [...destinations.data.devices].sort((left, right) => {
    const comparison = deviceSort.key === "name"
      ? left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" })
      : new Date(left[deviceSort.key] ?? 0).getTime() - new Date(right[deviceSort.key] ?? 0).getTime()
    return (deviceSort.direction === "asc" ? comparison : -comparison) || left.id.localeCompare(right.id)
  }) : []
  const webhooks = destinations.status === "success" ? [...destinations.data.webhooks].sort((left, right) => {
    const comparison = webhookSort.key === "lastSentAt"
      ? (left.lastSentAt ? new Date(left.lastSentAt).getTime() : 0) - (right.lastSentAt ? new Date(right.lastSentAt).getTime() : 0)
      : left[webhookSort.key].localeCompare(right[webhookSort.key], undefined, { numeric: true, sensitivity: "base" })
    return (webhookSort.direction === "asc" ? comparison : -comparison) || left.id.localeCompare(right.id)
  }) : []

  useEffect(() => {
    const timers = testTimers.current
    return () => { for (const timer of timers) window.clearTimeout(timer) }
  }, [])

  useEffect(() => {
    if (editor) {
      dialog.current?.showModal()
      dialog.current?.querySelector<HTMLInputElement>("input")?.focus()
    }
    else dialog.current?.close()
  }, [editor])

  useEffect(() => {
    if (payloadEvent) payloadDialog.current?.showModal()
    else payloadDialog.current?.close()
  }, [payloadEvent])

  useEffect(() => {
    if (events.status === "success" && page > 1 && events.data.events.length === 0) {
      setPage(Math.max(1, Math.ceil(events.data.total / events.data.pageSize)))
    }
  }, [events, page])

  async function registerDevice() {
    if (pending || currentDeviceRegistered) return
    setError(null)
    setEditorError(null)
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone
    if (!window.isSecureContext) {
      setEditor({ kind: "instructions", message: "Open Containarr using its HTTPS address, then register this device again. Push notifications require a secure connection." })
      return
    }
    if (ios && !standalone) {
      setEditor({ kind: "instructions", message: "On iPhone or iPad, open Containarr in Safari, tap Share, then Add to Home Screen. Open Containarr from that icon, return to Settings → Events, and tap Register this device. Web Push requires iOS or iPadOS 16.4 or later." })
      return
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setEditor({ kind: "instructions", message: "This browser does not support Web Push here. Use a current browser with push notification support. On iPhone or iPad, use iOS or iPadOS 16.4 or later and open Containarr from the Home Screen." })
      return
    }
    if (Notification.permission === "denied") {
      setEditor({ kind: "instructions", message: "Notifications are blocked for Containarr. Allow notifications in this site's browser settings (or your device's notification settings), then try registering again." })
      return
    }
    if (destinations.status !== "success") return
    setPending(true)
    try {
      // Request permission directly from the click, before any network or worker await.
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setEditor({ kind: "instructions", message: "Notification permission was not granted. Allow notifications for Containarr in your browser or device settings, then register this device again." })
        return
      }
      await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      const registration = await navigator.serviceWorker.ready
      const key = destinations.data.publicKey.replace(/-/g, "+").replace(/_/g, "/")
      const applicationServerKey = Uint8Array.from(atob(key + "=".repeat((4 - key.length % 4) % 4)), character => character.charCodeAt(0))
      let existing = await registration.pushManager.getSubscription()
      const existingKey = existing?.options.applicationServerKey
      if (existing && existingKey && (
        existingKey.byteLength !== applicationServerKey.byteLength
        || new Uint8Array(existingKey).some((byte, index) => byte !== applicationServerKey[index])
      )) {
        await existing.unsubscribe()
        existing = null
      }
      const registered = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
      setSubscription(registered)
      const savedDevice = destinations.data.devices.find(device => device.id === currentDeviceId)
      setName(savedDevice?.name ?? (ios ? (/iPhone/.test(navigator.userAgent) ? "iPhone" : "iPad")
        : /Android/.test(navigator.userAgent) ? "Android"
        : /Mac/.test(navigator.platform) ? "Mac"
        : /Win/.test(navigator.platform) ? "Windows PC" : "This device"))
      setEditor({ kind: "device" })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Device registration failed.")
    } finally {
      setPending(false)
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editor || editor.kind === "instructions" || pending) return
    setPending(true)
    setEditorError(null)
    try {
      if (editor.kind === "device" && !editor.id) {
        if (!subscription) throw new Error("Register this device again to enable notifications.")
        const device = await apiRequest<{ id: string }>("/api/v1/event/device", {
          method: "POST", body: JSON.stringify({ name: name.trim(), subscription: subscription.toJSON() }),
        })
        setCurrentDeviceId(device.id)
        try { localStorage.setItem("containarr-push-device", device.id) } catch { /* Storage is optional. */ }
      } else {
        await apiRequest(`/api/v1/event/${editor.kind}${editor.id ? `/${encodeURIComponent(editor.id)}` : ""}`, {
          method: editor.id ? "PATCH" : "POST",
          body: JSON.stringify({ name: name.trim(), ...(editor.kind === "webhook" ? { url: url.trim() } : {}) }),
        })
      }
      destinations.reload()
      setSubscription(null)
      setEditor(null)
    } catch (requestError) {
      setEditorError(requestError instanceof Error ? requestError.message : "Could not save.")
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    if (!confirmingDelete || pending) return
    const { kind, id } = confirmingDelete
    setPending(true)
    setError(null)
    setDeleteError(null)
    try {
      await apiRequest(`/api/v1/event/${kind === "event" ? "" : `${kind}/`}${encodeURIComponent(id)}`, { method: "DELETE" })
      if (kind === "device" && id === currentDeviceId) {
        setCurrentDeviceId(null)
        try { localStorage.removeItem("containarr-push-device") } catch { /* Storage is optional. */ }
        if ("serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.getRegistration("/").catch(() => undefined)
          const registered = await registration?.pushManager.getSubscription().catch(() => null)
          await registered?.unsubscribe().catch(() => false)
        }
      }
      if (kind === "event") events.reload()
      else destinations.reload()
      setConfirmingDelete(null)
    } catch (requestError) {
      setDeleteError(requestError instanceof Error ? requestError.message : `Could not delete ${kind}.`)
    } finally {
      setPending(false)
    }
  }

  async function sendTest(kind: "device" | "webhook", destination: Destination) {
    const key = `${kind}:${destination.id}`
    if (pending || testSent.has(key) || testErrors[key]) return
    setPending(true)
    setTesting(key)
    setError(null)
    try {
      await apiRequest(`/api/v1/event/${kind}/${encodeURIComponent(destination.id)}/test`, { method: "POST" })
      setTestSent(current => new Set(current).add(key))
    } catch (requestError) {
      setTestErrors(current => ({ ...current, [key]: requestError instanceof Error ? requestError.message : "Test event could not be sent." }))
    } finally {
      const timer = window.setTimeout(() => {
        setTestSent(current => {
          const next = new Set(current)
          next.delete(key)
          return next
        })
        setTestErrors(current => {
          const next = { ...current }
          delete next[key]
          return next
        })
        testTimers.current.delete(timer)
      }, 3000)
      testTimers.current.add(timer)
      destinations.reload()
      setTesting(null)
      setPending(false)
    }
  }

  async function createDebugEvent(eventName: string) {
    const key = `debug:${eventName}`
    if (!dev || pending || testSent.has(key)) return
    setPending(true)
    setCreatingDebugEvent(eventName)
    setDebugError(null)
    try {
      await apiRequest("/api/v1/event/debug?dev=1", { method: "POST", body: JSON.stringify({ eventName }) })
      setPage(1)
      events.reload()
      setTestSent(current => new Set(current).add(key))
      const timer = window.setTimeout(() => {
        setTestSent(current => {
          const next = new Set(current)
          next.delete(key)
          return next
        })
        testTimers.current.delete(timer)
      }, 3000)
      testTimers.current.add(timer)
    } catch (requestError) {
      setDebugError(requestError instanceof Error ? requestError.message : "Could not create a test event.")
    } finally {
      setCreatingDebugEvent(null)
      setPending(false)
    }
  }

  return (
    <section className="space-y-10">
      <div>
        <PageHeader title="Events" description="Updates and app availability from the last 31 days. Older events are automatically deleted." />
        <p className="mt-2 text-xs text-muted-foreground">Apps are reported offline after five minutes of stopped or unhealthy container status. Intentionally disabled apps are excluded.</p>
        {dev && <div className="mt-6 rounded-xl border border-dashed bg-muted/20 p-4">
          <h2 className="text-sm font-semibold">Debug events</h2>
          <p className="mt-1 text-xs text-muted-foreground">Create sample events in the log and send them to all registered devices and webhooks. Events are marked as tests.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              ...(debugApp ? [
                { eventName: "app.update_available", label: `${debugApp.name} update available` },
                { eventName: "app.updated", label: `${debugApp.name} updated` },
                { eventName: "app.offline", label: `${debugApp.name} offline` },
                { eventName: "app.online", label: `${debugApp.name} online` },
              ] : []),
              { eventName: "containarr.update_available", label: "Containarr update available" },
              { eventName: "containarr.updated", label: "Containarr updated" },
            ].map(({ eventName, label }) => <Button key={eventName} variant="outline" disabled={pending || testSent.has(`debug:${eventName}`)} onClick={() => void createDebugEvent(eventName)}>
              {creatingDebugEvent === eventName ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : testSent.has(`debug:${eventName}`) ? <Check className="mr-2 size-4 text-emerald-600 dark:text-emerald-400" /> : <Play className="mr-2 size-4" />}
              {label}
            </Button>)}
          </div>
          {debugError && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{debugError}</p>}
        </div>}
        <div className="mt-6 overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground"><tr>
              {([{ key: "createdAt", label: "Date & time" }, { key: "message", label: "Event" }] as const).map(({ key, label }) => (
                <SortableTableHeader key={key} label={label} active={eventSort.key === key} direction={eventSort.direction} onClick={() => {
                  setEventSort(current => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }))
                  setPage(1)
                }} />
              ))}
              <th scope="col" className="w-12 px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody className="divide-y">
              {events.status !== "success" ? <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                {events.status === "loading" ? "Loading events…" : <><span role="alert">{events.error}</span> <Button variant="outline" onClick={events.reload}>Retry</Button></>}
              </td></tr> : events.data.events.length === 0 ? <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No events in the last 31 days.</td></tr> : events.data.events.map(event => <tr key={event.id} className="hover:bg-muted/25">
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground"><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></td>
                <td className="min-w-60 px-4 py-3 font-medium">
                  {event.appId && !event.appId.startsWith("debug-") && event.appName && event.message.startsWith(event.appName) ? <>
                    <Link to={`/apps/${encodeURIComponent(event.appId)}`} className="underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-current">{event.appName}</Link>
                    {event.message.slice(event.appName.length)}
                  </> : event.message}
                  {event.details?.test && <span className="ml-2 inline-block rounded border px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">Test</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                  <Button variant="ghost" title="View JSON POST" aria-label={`View JSON POST: ${event.message}`} onClick={() => setPayloadEvent(event)}><Braces className="size-4" /></Button>
                  <Button variant="ghost" disabled={pending} title="Delete event" aria-label={`Delete event: ${event.message}`} onClick={() => { setDeleteError(null); setConfirmingDelete({ kind: "event", id: event.id, name: event.message }) }}><Trash2 className="size-4" /></Button>
                  </div>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {events.status === "success" && events.data.total > 50 && <div className="mt-3 flex items-center justify-end gap-3 text-xs text-muted-foreground">
          <span>Page {page} of {Math.ceil(events.data.total / events.data.pageSize)}</span>
          <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" disabled={page * events.data.pageSize >= events.data.total} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
        </div>}
      </div>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-semibold tracking-tight">Push Notifications</h2><p className="mt-1 text-sm text-muted-foreground">Receive new events on your registered devices.</p></div>
          <Button disabled={pending || destinations.status !== "success" || currentDeviceRegistered} onClick={() => void registerDevice()}>
            {currentDeviceRegistered ? <Check className="mr-2 size-4" /> : <Bell className="mr-2 size-4" />}
            {currentDeviceRegistered ? "This device is registered" : pending && !editor ? "Please wait…" : "Register this device"}
          </Button>
        </div>
        <div className="mt-5 overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground"><tr>
              {([{ key: "name", label: "Device" }, { key: "createdAt", label: "Registered" }, { key: "lastSentAt", label: "Last delivery" }] as const).map(({ key, label }) => (
                <SortableTableHeader key={key} label={label} active={deviceSort.key === key} direction={deviceSort.direction} onClick={() => setDeviceSort(current => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }))} />
              ))}
              <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody className="divide-y">
              {destinations.status !== "success" ? <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">{destinations.status === "loading" ? "Loading devices…" : <><span role="alert">{destinations.error}</span> <Button variant="outline" onClick={destinations.reload}>Retry</Button></>}</td></tr>
                : destinations.data.devices.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No devices registered.</td></tr>
                : devices.map(device => <tr key={device.id} className="hover:bg-muted/25">
                  <td className="px-4 py-3 font-medium">{device.name}{device.id === currentDeviceId && <span className="ml-2 text-xs font-normal text-muted-foreground">This device</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{new Date(device.createdAt).toLocaleDateString()}</td>
                  <td className={`px-4 py-3 text-xs ${device.lastError ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{device.lastError ?? (device.lastSentAt ? new Date(device.lastSentAt).toLocaleString() : "No events sent yet")}</td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      disabled={pending || testSent.has(`device:${device.id}`) || Boolean(testErrors[`device:${device.id}`])}
                      title={testErrors[`device:${device.id}`] ?? (testSent.has(`device:${device.id}`) ? "Test event sent" : "Send test event")}
                      aria-label={testErrors[`device:${device.id}`] ? `${device.name}: ${testErrors[`device:${device.id}`]}` : testSent.has(`device:${device.id}`) ? `Test event sent to ${device.name}` : `Send test event to ${device.name}`}
                      onClick={() => void sendTest("device", device)}
                    >
                      {testing === `device:${device.id}` ? <LoaderCircle className="size-4 animate-spin" /> : testErrors[`device:${device.id}`] ? <X className="size-4 text-red-600 dark:text-red-400" /> : testSent.has(`device:${device.id}`) ? <Check className="size-4 text-emerald-600 dark:text-emerald-400" /> : <Play className="size-4" />}
                    </Button>
                    <Button variant="ghost" disabled={pending} aria-label={`Rename ${device.name}`} onClick={() => { setName(device.name); setEditorError(null); setEditor({ kind: "device", id: device.id }) }}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" disabled={pending} aria-label={`Remove ${device.name}`} onClick={() => { setDeleteError(null); setConfirmingDelete({ kind: "device", id: device.id, name: device.name }) }}><Trash2 className="size-4" /></Button>
                  </div></td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-semibold tracking-tight">Webhooks</h2><p className="mt-1 text-sm text-muted-foreground">Send each new event to an HTTP endpoint as a JSON POST.</p></div>
          <Button disabled={pending || destinations.status !== "success"} onClick={() => { setName(""); setUrl(""); setEditorError(null); setEditor({ kind: "webhook" }) }}><Plus className="mr-2 size-4" />Add webhook</Button>
        </div>
        <div className="mt-5 overflow-x-auto rounded-xl border bg-card shadow-xs">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground"><tr>
              {([{ key: "name", label: "Name" }, { key: "url", label: "URL" }, { key: "lastSentAt", label: "Last delivery" }] as const).map(({ key, label }) => (
                <SortableTableHeader key={key} label={label} active={webhookSort.key === key} direction={webhookSort.direction} onClick={() => setWebhookSort(current => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }))} />
              ))}
              <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody className="divide-y">
              {destinations.status !== "success" ? <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">{destinations.status === "loading" ? "Loading webhooks…" : <><span role="alert">{destinations.error}</span> <Button variant="outline" onClick={destinations.reload}>Retry</Button></>}</td></tr>
                : destinations.data.webhooks.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No webhooks registered.</td></tr>
                : webhooks.map(webhook => <tr key={webhook.id} className="hover:bg-muted/25">
                  <td className="px-4 py-3 font-medium">{webhook.name}</td>
                  <td className="max-w-80 truncate px-4 py-3 font-mono text-xs" title={webhook.url}>{webhook.url}</td>
                  <td className={`px-4 py-3 text-xs ${webhook.lastError ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{webhook.lastError ?? (webhook.lastSentAt ? new Date(webhook.lastSentAt).toLocaleString() : "No events sent yet")}</td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      disabled={pending || testSent.has(`webhook:${webhook.id}`) || Boolean(testErrors[`webhook:${webhook.id}`])}
                      title={testErrors[`webhook:${webhook.id}`] ?? (testSent.has(`webhook:${webhook.id}`) ? "Test event sent" : "Send test event")}
                      aria-label={testErrors[`webhook:${webhook.id}`] ? `${webhook.name}: ${testErrors[`webhook:${webhook.id}`]}` : testSent.has(`webhook:${webhook.id}`) ? `Test event sent to ${webhook.name}` : `Send test event to ${webhook.name}`}
                      onClick={() => void sendTest("webhook", webhook)}
                    >
                      {testing === `webhook:${webhook.id}` ? <LoaderCircle className="size-4 animate-spin" /> : testErrors[`webhook:${webhook.id}`] ? <X className="size-4 text-red-600 dark:text-red-400" /> : testSent.has(`webhook:${webhook.id}`) ? <Check className="size-4 text-emerald-600 dark:text-emerald-400" /> : <Play className="size-4" />}
                    </Button>
                    <Button variant="ghost" disabled={pending} aria-label={`Edit ${webhook.name}`} onClick={() => { setName(webhook.name); setUrl(webhook.url); setEditorError(null); setEditor({ kind: "webhook", id: webhook.id }) }}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" disabled={pending} aria-label={`Remove ${webhook.name}`} onClick={() => { setDeleteError(null); setConfirmingDelete({ kind: "webhook", id: webhook.id, name: webhook.name }) }}><Trash2 className="size-4" /></Button>
                  </div></td>
                </tr>)}
            </tbody>
          </table>
        </div>
        <details className="mt-4 text-sm text-muted-foreground">
          <summary className="cursor-pointer">JSON payload</summary>
          <div role="tablist" aria-label="Event payload examples" className="mt-3 flex overflow-x-auto border-b">
            {payloadExamples.map((example, index) => <button
              key={example.eventName}
              type="button"
              role="tab"
              id={`payload-tab-${example.eventName}`}
              aria-controls={`payload-panel-${example.eventName}`}
              aria-selected={payloadExample === index}
              tabIndex={payloadExample === index ? 0 : -1}
              className={`shrink-0 border-b-2 px-3 py-2 font-mono text-xs outline-none focus-visible:bg-muted ${payloadExample === index ? "border-primary text-foreground" : "border-transparent hover:text-foreground"}`}
              onClick={() => setPayloadExample(index)}
              onKeyDown={event => {
                let next = index
                if (event.key === "ArrowRight") next = (index + 1) % payloadExamples.length
                else if (event.key === "ArrowLeft") next = (index - 1 + payloadExamples.length) % payloadExamples.length
                else if (event.key === "Home") next = 0
                else if (event.key === "End") next = payloadExamples.length - 1
                else return
                event.preventDefault()
                setPayloadExample(next)
                document.getElementById(`payload-tab-${payloadExamples[next].eventName}`)?.focus()
              }}
            >{example.eventName}</button>)}
          </div>
          {payloadExamples.map((example, index) => <pre
            key={example.eventName}
            role="tabpanel"
            id={`payload-panel-${example.eventName}`}
            aria-labelledby={`payload-tab-${example.eventName}`}
            hidden={payloadExample !== index}
            tabIndex={0}
            className="mt-3 overflow-x-auto rounded-lg border bg-muted/25 p-4 text-xs"
          >{JSON.stringify({
            eventId: "f45ee390-7d86-4a83-983c-8b6bb504cd16",
            eventName: example.eventName,
            eventAt: "2026-09-04T12:00:00.000Z",
            appId: example.appId,
            appName: example.appName,
            message: example.message,
            details: example.details,
          }, null, 2)}</pre>)}
          <p className="mt-2 text-xs">Deliveries are attempted once with a 10-second timeout. Failed deliveries appear in the table; up to three redirects are followed.</p>
        </details>
      </div>

      <dialog ref={dialog} aria-labelledby="event-editor-title" className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/45" onCancel={event => { if (pending) event.preventDefault(); else setEditor(null) }} onClose={() => setEditor(null)}>
        {editor && <>
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h2 id="event-editor-title" className="font-semibold">{editor.kind === "instructions" ? "Enable push notifications" : editor.kind === "device" ? editor.id ? "Rename device" : "Name this device" : editor.id ? "Edit webhook" : "Add webhook"}</h2>
            <Button variant="ghost" disabled={pending} aria-label="Close dialog" onClick={() => setEditor(null)}><X className="size-4" /></Button>
          </div>
          {editor.kind === "instructions" ? <div className="space-y-5 p-6"><p className="text-sm leading-relaxed text-muted-foreground">{editor.message}</p><div className="flex justify-end"><Button onClick={() => setEditor(null)}>Got it</Button></div></div> : <form onSubmit={event => void save(event)}>
            <fieldset disabled={pending} className="space-y-5 p-6">
              <div><label htmlFor="event-destination-name" className="text-sm font-medium">{editor.kind === "device" && !editor.id ? "Device name" : "Name"}</label><Input id="event-destination-name" required autoFocus maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder={editor.kind === "device" ? "iPhone" : "Home automation"} className="mt-1.5" /></div>
              {editor.kind === "device" && !editor.id && <p className="text-xs text-muted-foreground">Choose a name to recognize this device. Save to start receiving events.</p>}
              {editor.kind === "webhook" && <div><label htmlFor="event-webhook-url" className="text-sm font-medium">URL</label><Input id="event-webhook-url" type="url" required maxLength={4096} value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/webhook" className="mt-1.5" /><p className="mt-2 text-xs text-muted-foreground">The endpoint must accept HTTP POST requests with a JSON body.</p></div>}
              {editorError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{editorError}</p>}
            </fieldset>
            <div className="flex justify-end gap-2 border-t px-6 py-4"><Button type="button" variant="outline" disabled={pending} onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" disabled={pending || !name.trim() || (editor.kind === "webhook" && !url.trim())}>{pending && <LoaderCircle className="mr-2 size-4 animate-spin" />}Save</Button></div>
          </form>}
        </>}
      </dialog>
      <dialog ref={payloadDialog} aria-labelledby="event-payload-title" className="fixed inset-0 m-auto max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-auto rounded-2xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/45" onCancel={() => setPayloadEvent(null)} onClose={() => setPayloadEvent(null)}>
        {payloadEvent && <>
          <div className="flex items-center justify-between gap-4 border-b px-6 py-4">
            <div>
              <h2 id="event-payload-title" className="font-semibold">JSON POST</h2>
              <p className="mt-1 text-xs text-muted-foreground">Webhook request body for this event.</p>
            </div>
            <Button variant="ghost" aria-label="Close JSON POST" onClick={() => setPayloadEvent(null)}><X className="size-4" /></Button>
          </div>
          <pre tabIndex={0} aria-label="JSON request body" className="max-h-[65vh] overflow-auto p-6 font-mono text-xs leading-relaxed">{JSON.stringify({
            eventId: payloadEvent.id,
            eventName: payloadEvent.eventName,
            eventAt: payloadEvent.createdAt,
            appId: payloadEvent.appId ?? null,
            appName: payloadEvent.appName ?? null,
            message: payloadEvent.message,
            details: payloadEvent.details ?? {},
          }, null, 2)}</pre>
        </>}
      </dialog>
      <DeleteConfirmDialog
        open={confirmingDelete !== null}
        title={`Delete ${confirmingDelete?.kind ?? "destination"} “${confirmingDelete?.name ?? ""}”?`}
        description={confirmingDelete?.kind === "event"
          ? "This permanently removes the event from the log."
          : confirmingDelete?.kind === "device"
          ? "This device will stop receiving push notifications. You can register it again from that device."
          : "This webhook will stop receiving events. You can add it again later."}
        deleting={pending}
        error={deleteError}
        onCancel={() => { if (!pending) { setConfirmingDelete(null); setDeleteError(null) } }}
        onConfirm={() => void remove()}
      />
    </section>
  )
}
