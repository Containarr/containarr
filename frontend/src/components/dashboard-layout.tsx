import { Boxes, Container, LayoutGrid, Waypoints } from "lucide-react"
import { NavLink, Outlet } from "react-router-dom"

import { ThemeSwitch } from "@/components/theme-switch"

const navigation = [
  { label: "Apps", to: "/apps", icon: LayoutGrid },
  { label: "Containers", to: "/containers", icon: Container },
  { label: "Proxies", to: "/proxies", icon: Waypoints },
]

export function DashboardLayout() {
  return (
    <div className="min-h-screen bg-muted/25 md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="border-b bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-r md:border-b-0">
        <div className="flex h-16 items-center px-4 md:h-20 md:px-5">
          <NavLink
            to="/apps"
            className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background shadow-sm">
              <Boxes className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-base font-semibold leading-none tracking-tight">
                Containarr
              </span>
              <span className="mt-1 block text-[11px] leading-none text-muted-foreground">
                Control Center
              </span>
            </span>
          </NavLink>
        </div>

        <nav aria-label="Main navigation" className="px-3 pb-3 md:flex-1 md:py-2">
          <p className="mb-2 hidden px-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase md:block">
            Manage
          </p>
          <div className="flex gap-1 md:flex-col">
            {navigation.map(({ icon: Icon, label, to }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring md:flex-none ${
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
        <div className="border-t p-3">
          <ThemeSwitch />
        </div>
      </aside>

      <main className="min-w-0">
        <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-10 lg:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
