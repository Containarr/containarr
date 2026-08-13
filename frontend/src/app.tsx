import { Navigate, Route, Routes } from "react-router-dom"

import { DashboardLayout } from "@/components/dashboard-layout"
import { AppDetailsPage } from "@/pages/app-details"
import { AppsPage } from "@/pages/apps"
import { ContainerDetailsPage } from "@/pages/container-details"
import { ContainersPage } from "@/pages/containers"
import { ProxiesPage } from "@/pages/proxies"
import { ProxyDetailsPage } from "@/pages/proxy-details"

export default function App() {
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
      </Route>
      <Route path="*" element={<Navigate to="/apps" replace />} />
    </Routes>
  )
}
