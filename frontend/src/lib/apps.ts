import type { AppResource } from "@/lib/types"

export function getPublicAppUrl(app: AppResource, domain: string | null) {
  if (app.disabled || !app.subdomain || !domain) return null

  const protocol = app.tls === "only_http" ? "http" : "https"
  return `${protocol}://${app.subdomain}.${domain}`
}
