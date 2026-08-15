import { useEffect, useState } from "react"
import {
  ArrowRight,
  Container,
  Globe2,
  LayoutGrid,
  LogOut,
  Menu,
  Settings2,
  UserRound,
  Waypoints,
  X,
} from "lucide-react"
import { NavLink, Outlet, useLocation } from "react-router-dom"

import { ThemeSwitch } from "@/components/theme-switch"
import { useApi } from "@/hooks/use-api"
import { useAuth } from "@/hooks/use-auth"
import type { DomainSettings } from "@/lib/types"

const navigation = [
  { label: "Apps", to: "/apps", icon: LayoutGrid },
  { label: "Containers", to: "/containers", icon: Container },
  { label: "Proxies", to: "/proxies", icon: Waypoints },
  { label: "Settings", to: "/settings", icon: Settings2 },
]

export function DashboardLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const pageTitle = navigation.find(({ to }) =>
    location.pathname.startsWith(to)
  )?.label ?? "Containarr"

  useEffect(() => {
    if (!menuOpen) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [menuOpen])

  return (
    <div className="min-h-screen bg-muted/25 md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-20 items-center px-5">
          <Brand />
        </div>
        <SidebarNavigation />
        <SidebarDomainPrompt />
        <SidebarFooter />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b bg-sidebar/95 px-4 text-sidebar-foreground backdrop-blur md:hidden">
          <button
            type="button"
            aria-label="Open navigation"
            aria-controls="mobile-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <Menu className="size-5" />
          </button>
          <span className="text-lg font-semibold tracking-tight">{pageTitle}</span>
          <div id="mobile-header-action" className="ml-auto flex items-center" />
        </header>

        {menuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 cursor-default bg-black/50"
              onClick={() => setMenuOpen(false)}
            />
            <aside
              id="mobile-navigation"
              className="relative flex h-full w-[18rem] max-w-[85vw] flex-col border-r bg-sidebar text-sidebar-foreground shadow-2xl"
            >
              <div className="flex h-16 items-center justify-between px-4">
                <Brand onNavigate={() => setMenuOpen(false)} />
                <button
                  type="button"
                  aria-label="Close navigation"
                  onClick={() => setMenuOpen(false)}
                  className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                >
                  <X className="size-5" />
                </button>
              </div>
              <SidebarNavigation onNavigate={() => setMenuOpen(false)} />
              <SidebarDomainPrompt onNavigate={() => setMenuOpen(false)} />
              <SidebarFooter />
            </aside>
          </div>
        )}

        <main>
          <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <NavLink
      to="/apps"
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      <img
        src="/logo.svg"
        alt=""
        className="size-11 shrink-0 object-contain"
        aria-hidden="true"
      />
      <span>
        <span className="block text-base leading-none font-semibold tracking-tight">
          Containarr
        </span>
        <span className="mt-1 block text-[11px] leading-none text-muted-foreground">
          Control Center
        </span>
      </span>
    </NavLink>
  )
}

function SidebarNavigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav
      id={onNavigate ? undefined : "desktop-navigation"}
      aria-label="Main navigation"
      className="flex-1 px-3 py-2"
    >
      <p className="mb-2 px-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        Manage
      </p>
      <div className="flex flex-col gap-1">
        {navigation.map(({ icon: Icon, label, to }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              }`
            }
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function SidebarDomainPrompt({ onNavigate }: { onNavigate?: () => void }) {
  const domainRequest = useApi<DomainSettings>("/api/v1/ddns/domain")
  const [dismissed, setDismissed] = useState(
    () => window.localStorage.getItem("containarr-domain-prompt-dismissed") === "true"
  )

  if (
    dismissed ||
    domainRequest.status !== "success" ||
    domainRequest.data.customDomain
  ) {
    return null
  }

  return (
    <div className="mx-3 mb-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 dark:border-cyan-400/25 dark:bg-cyan-400/10">
      <div className="flex items-start gap-2">
        <Globe2 className="mt-0.5 size-4 shrink-0 text-cyan-700 dark:text-cyan-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-cyan-950 dark:text-cyan-100">
            Bring your own domain!
          </p>
          <p className="mt-1 text-xs leading-relaxed text-cyan-950/65 dark:text-cyan-100/65">
            Make your apps available on your own domain.
          </p>
        </div>
        <button
          type="button"
          title="Dismiss"
          aria-label="Dismiss custom domain prompt"
          onClick={() => {
            window.localStorage.setItem("containarr-domain-prompt-dismissed", "true")
            setDismissed(true)
          }}
          className="-mt-1 -mr-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-cyan-900/60 hover:bg-cyan-500/15 hover:text-cyan-950 dark:text-cyan-100/60 dark:hover:bg-cyan-400/15 dark:hover:text-cyan-100"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <NavLink
        to="/settings?domain=custom"
        onClick={onNavigate}
        className="mt-3 flex items-center justify-between rounded-lg bg-cyan-500/20 px-3 py-2 text-xs font-medium text-cyan-950 transition-colors hover:bg-cyan-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 dark:bg-cyan-400/15 dark:text-cyan-100 dark:hover:bg-cyan-400/25"
      >
        Set up Domain
        <ArrowRight className="size-3.5" />
      </NavLink>
    </div>
  )
}

function SidebarFooter() {
  const { state, logout } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const username = state.status === "ready" ? state.data.user?.username : null

  async function signOut() {
    setLoggingOut(true)
    setError(null)
    try {
      await logout()
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Sign out failed."
      )
      setLoggingOut(false)
    }
  }

  return (
    <div className="space-y-3 border-t p-3">
      <div className="flex items-center gap-2 px-1">
        <UserRound className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {username}
        </span>
        <button
          type="button"
          title="Sign out"
          aria-label="Sign out"
          disabled={loggingOut}
          onClick={() => void signOut()}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-50"
        >
          <LogOut className="size-4" />
        </button>
      </div>
      {error && <p className="px-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <ThemeSwitch />
    </div>
  )
}
