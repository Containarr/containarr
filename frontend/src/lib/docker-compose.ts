import { parse } from "yaml"

import type { AppConfiguration, DockerPort } from "@/lib/types"

export function appConfigurationFromCompose(source: string): AppConfiguration {
  let document: unknown
  try {
    document = parse(source, { merge: true })
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Invalid YAML.")
  }

  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("The YAML must contain a Docker Compose document.")
  }

  const services = (document as Record<string, unknown>).services
  if (!services || typeof services !== "object" || Array.isArray(services)) {
    throw new Error("The Compose file must contain a services section.")
  }

  const serviceEntries = Object.entries(services)
  if (serviceEntries.length === 0) {
    throw new Error("The Compose file must contain a service.")
  }
  if (serviceEntries.length > 1) {
    throw new Error("Import supports one Compose service at a time.")
  }

  const [serviceName, serviceValue] = serviceEntries[0]
  if (!serviceValue || typeof serviceValue !== "object" || Array.isArray(serviceValue)) {
    throw new Error(`Service ${serviceName} must be an object.`)
  }
  const service = serviceValue as Record<string, unknown>
  if (typeof service.image !== "string" || service.image.trim() === "") {
    throw new Error(`Service ${serviceName} must specify an image.`)
  }

  const environment: Record<string, string> = {}
  if (Array.isArray(service.environment)) {
    for (const item of service.environment) {
      if (typeof item !== "string") continue
      const separator = item.indexOf("=")
      environment[separator === -1 ? item : item.slice(0, separator)] =
        separator === -1 ? "" : item.slice(separator + 1)
    }
  } else if (service.environment && typeof service.environment === "object") {
    for (const [key, value] of Object.entries(service.environment)) {
      environment[key] = value === null || value === undefined ? "" : String(value)
    }
  }

  const volumes: string[] = []
  if (Array.isArray(service.volumes)) {
    for (const item of service.volumes) {
      if (typeof item === "string") {
        volumes.push(item)
      } else if (item && typeof item === "object" && !Array.isArray(item)) {
        const volume = item as Record<string, unknown>
        if (typeof volume.target !== "string") continue
        const source = typeof volume.source === "string" ? volume.source : ""
        volumes.push(`${source}:${volume.target}${volume.read_only === true ? ":ro" : ""}`)
      }
    }
  }

  const devices: string[] = []
  if (Array.isArray(service.devices)) {
    for (const item of service.devices) {
      if (typeof item === "string") {
        devices.push(item)
      } else if (item && typeof item === "object" && !Array.isArray(item)) {
        const device = item as Record<string, unknown>
        if (typeof device.source !== "string" || typeof device.target !== "string") continue
        devices.push(
          [device.source, device.target, typeof device.permissions === "string" ? device.permissions : null]
            .filter(Boolean)
            .join(":")
        )
      }
    }
  }

  const ports: DockerPort[] = []
  let internalPort: number | null = null
  if (Array.isArray(service.ports)) {
    for (const item of service.ports) {
      if (typeof item === "number" || typeof item === "string") {
        const value = String(item)
        const protocolMatch = value.match(/\/(tcp|udp)$/i)
        const protocol = (protocolMatch?.[1].toLowerCase() ?? "tcp") as "tcp" | "udp"
        const withoutProtocol = protocolMatch ? value.slice(0, -protocolMatch[0].length) : value
        const parts = withoutProtocol.split(":")
        const target = Number(parts.at(-1))
        if (!Number.isInteger(target) || target < 1 || target > 65535) continue
        internalPort ??= target
        if (parts.length < 2) continue
        const host = Number(parts.at(-2))
        if (!Number.isInteger(host) || host < 1 || host > 65535) continue
        const hostIp = parts.length > 2 ? parts.slice(0, -2).join(":").replace(/^\[|\]$/g, "") : ""
        ports.push({ host, container: target, protocol, ...(hostIp ? { hostIp } : {}) })
      } else if (item && typeof item === "object" && !Array.isArray(item)) {
        const port = item as Record<string, unknown>
        const target = Number(port.target)
        const host = Number(port.published)
        if (!Number.isInteger(target) || target < 1 || target > 65535) continue
        internalPort ??= target
        if (!Number.isInteger(host) || host < 1 || host > 65535) continue
        const protocol = port.protocol === "udp" ? "udp" : "tcp"
        const hostIp = typeof port.host_ip === "string" ? port.host_ip : ""
        ports.push({ host, container: target, protocol, ...(hostIp ? { hostIp } : {}) })
      }
    }
  }

  if (internalPort === null && Array.isArray(service.expose)) {
    for (const item of service.expose) {
      const port = Number(String(item).split("/")[0])
      if (Number.isInteger(port) && port > 0 && port <= 65535) {
        internalPort = port
        break
      }
    }
  }

  let dockerUserId: number | null = null
  let dockerGroupId: number | null = null
  if (typeof service.user === "number" || typeof service.user === "string") {
    const match = String(service.user).match(/^(\d+)(?::(\d+))?$/)
    if (match) {
      dockerUserId = Number(match[1])
      dockerGroupId = match[2] ? Number(match[2]) : null
    }
  }

  const capabilities = Array.isArray(service.cap_add)
    ? service.cap_add
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.startsWith("CAP_") ? value : `CAP_${value}`)
    : []
  const name = typeof service.container_name === "string" && service.container_name.trim()
    ? service.container_name.trim()
    : serviceName
  const subdomain = serviceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "") || "app"

  return {
    name,
    subdomain,
    port: internalPort,
    tls: "only_https",
    dockerImage: service.image.trim(),
    dockerNetworkMode: service.network_mode === "host" ? "host" : "bridge",
    dockerVolumes: volumes,
    dockerDevices: devices,
    dockerPorts: ports,
    dockerEnvironment: environment,
    dockerUserId,
    dockerGroupId,
    dockerPrivileged: service.privileged === true,
    dockerCapabilities: capabilities,
    policyId: "public",
  }
}
