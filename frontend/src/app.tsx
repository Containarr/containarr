import { LoaderCircle } from "lucide-react"
import { Navigate, Route, Routes } from "react-router-dom"

import { AuthLogo } from "@/components/auth-logo"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AuthProvider, useAuth } from "@/hooks/use-auth"
import { AppDetailsPage } from "@/pages/app-details"
import { AppsPage } from "@/pages/apps"
import { ContainerDetailsPage } from "@/pages/container-details"
import { ContainersPage } from "@/pages/containers"
import { LoginPage } from "@/pages/login"
import { OnboardingPage } from "@/pages/onboarding"
import { ProxiesPage } from "@/pages/proxies"
import { ProxyDetailsPage } from "@/pages/proxy-details"
import { SettingsPage } from "@/pages/settings"

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

function AppRoutes() {
  const { state, reload } = useAuth()

  if (state.status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/25">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <AuthLogo className="size-24" />
          <LoaderCircle className="size-5 animate-spin" aria-label="Loading" />
        </div>
      </main>
    )
  }

  if (state.status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/25 p-5">
        <Card className="w-full max-w-sm text-center shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">Unable to reach Containarr</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-5 text-sm text-muted-foreground">{state.error}</p>
            <Button type="button" onClick={() => void reload()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (state.data.onboardingRequired) {
    return (
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }

  if (!state.data.authenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route path="/apps" element={<AppsPage />} />
        <Route path="/apps/:appId" element={<AppDetailsPage />} />
        <Route path="/containers" element={<ContainersPage />} />
        <Route
          path="/containers/:containerId"
          element={<ContainerDetailsPage />}
        />
        <Route path="/proxies" element={<ProxiesPage />} />
        <Route path="/proxies/:proxyId" element={<ProxyDetailsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="/login" element={<Navigate to="/apps" replace />} />
      <Route path="/onboarding" element={<Navigate to="/apps" replace />} />
      <Route path="*" element={<Navigate to="/apps" replace />} />
    </Routes>
  )
}
