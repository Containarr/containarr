import type { AppResource } from "@/lib/types"

export function getPublicAppUrl(app: AppResource, domain: string | null) {
  if (app.disabled || !app.subdomain || !domain) return null

  const protocol = app.tls === "only_http" ? "http" : "https"
  return `${protocol}://${app.subdomain}.${domain}`
}

export function exportAppYaml(app: AppResource) {
  const serviceName = app.subdomain || app.id
  const lines = [
    "# Exported by Containarr",
    "services:",
    `  ${JSON.stringify(serviceName)}:`,
    `    image: ${JSON.stringify(app.dockerImage)}`,
    `    container_name: ${JSON.stringify(serviceName)}`,
    `    hostname: ${JSON.stringify(serviceName)}`,
    "    restart: unless-stopped",
  ]

  if (app.disabled) lines.push("    profiles: [disabled]")
  if (app.dockerUserId !== null) {
    lines.push(`    user: ${JSON.stringify(
      app.dockerGroupId === null
        ? String(app.dockerUserId)
        : `${app.dockerUserId}:${app.dockerGroupId}`
    )}`)
  }
  if (app.dockerPrivileged) lines.push("    privileged: true")

  const environment = Object.entries(app.dockerEnvironment)
    .sort(([left], [right]) => left.localeCompare(right))
  if (environment.length > 0) {
    lines.push("    environment:")
    for (const [key, value] of environment) {
      lines.push(`      ${JSON.stringify(key)}: ${JSON.stringify(String(value))}`)
    }
  }
  if (app.dockerVolumes.length > 0) {
    lines.push("    volumes:")
    for (const volume of app.dockerVolumes) {
      lines.push(`      - ${JSON.stringify(volume)}`)
    }
  }
  if (app.dockerDevices.length > 0) {
    lines.push("    devices:")
    for (const device of app.dockerDevices) {
      lines.push(`      - ${JSON.stringify(device)}`)
    }
  }
  if (app.dockerNetworkMode === "host") {
    lines.push("    network_mode: host")
  } else {
    if (app.dockerPorts.length > 0) {
      lines.push("    ports:")
      for (const port of app.dockerPorts) {
        const hostIp = port.hostIp ? `${port.hostIp}:` : ""
        lines.push(`      - ${JSON.stringify(`${hostIp}${port.host}:${port.container}/${port.protocol}`)}`)
      }
    }
  }
  if (app.dockerCapabilities.length > 0) {
    lines.push("    cap_add:")
    for (const capability of app.dockerCapabilities) {
      lines.push(`      - ${JSON.stringify(capability)}`)
    }
  }

  const url = URL.createObjectURL(new Blob(
    [`${lines.join("\n")}\n`],
    { type: "application/yaml;charset=utf-8" }
  ))
  const link = document.createElement("a")
  link.href = url
  link.download = `${serviceName}.yaml`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
