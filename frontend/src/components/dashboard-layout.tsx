import { useEffect, useState } from "react"
import {
  Container,
  LayoutGrid,
  Menu,
  Waypoints,
  X,
} from "lucide-react"
import { NavLink, Outlet, useLocation } from "react-router-dom"

import { ThemeSwitch } from "@/components/theme-switch"

const navigation = [
  { label: "Apps", to: "/apps", icon: LayoutGrid },
  { label: "Containers", to: "/containers", icon: Container },
  { label: "Proxies", to: "/proxies", icon: Waypoints },
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
        <div className="border-t p-3">
          <ThemeSwitch />
        </div>
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
              <div className="border-t p-3">
                <ThemeSwitch />
              </div>
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
