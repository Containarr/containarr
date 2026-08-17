import type { ProxyResource } from "@/lib/types"

export function getPublicProxyUrl(
  proxy: ProxyResource,
  domain: string | null
) {
  if (proxy.disabled || !proxy.subdomain || !domain) return null

  const protocol = proxy.tls === "only_http" ? "http" : "https"
  return `${protocol}://${proxy.subdomain}.${domain}`
}
