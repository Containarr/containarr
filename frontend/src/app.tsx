import { Navigate, Route, Routes } from "react-router-dom"

import { DashboardLayout } from "@/components/dashboard-layout"
import { AppDetailsPage } from "@/pages/app-details"
import { AppsPage } from "@/pages/apps"
import { ContainerDetailsPage } from "@/pages/container-details"
import { ContainersPage } from "@/pages/containers"

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
      </Route>
      <Route path="*" element={<Navigate to="/apps" replace />} />
    </Routes>
  )
}
