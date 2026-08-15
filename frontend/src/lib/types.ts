export type AppResource = {
  id: string
  name: string | null
  subdomain: string | null
  state: string | null
  port: number | null
  url: string | null
  registryId: string | null
  registryVersion: number | null
  tls: string
  containerId: string | null
  dockerImage: string
  autoUpdate: boolean
  policyId: string
  imageUpdate: {
    status:
      | "not_checked"
      | "checking"
      | "available"
      | "updating"
      | "up_to_date"
      | "error"
    checkedAt: string | null
    error: string | null
  }
  dockerNetworkMode: "bridge" | "host"
  dockerVolumes: string[]
  dockerDevices: string[]
  dockerPorts: DockerPort[]
  dockerEnvironment: Record<string, string>
  dockerPrivileged: boolean
  dockerCapabilities: string[]
  certificate: CertificateStatus
}

export type CertificateStatus = {
  hostname: string | null
  status: "not_required" | "provisioning" | "renewing" | "ready" | "error"
  expiresAt: string | null
  error: string | null
}

export type DockerPort = {
  host: number
  container: number
  protocol: "tcp" | "udp"
}

export type RegistryApp = {
  category: string
  version: number
  name: string
  port: number
  description: string
  website: string
  dockerImage: string
  dockerPorts: DockerPort[]
  dockerNetworkMode: "bridge" | "host"
  dockerVolumes: Record<string, string> | string[]
  dockerDevices?: Record<string, string> | string[]
  dockerEnvironment: Record<string, string>
  dockerPrivileged?: boolean
  dockerCapabilities?: string[]
}

export type ContainerResource = {
  id: string
  name: string
  image: string
  state: string
  status: string
  labels: Record<string, string>
}

export type ContainerDetails = ContainerResource & {
  imageId: string
  created: string
  startedAt: string
  finishedAt: string
  platform: string
  restartCount: number
  networkMode: string
  privileged: boolean
  ports: Record<string, Array<{ HostIp: string; HostPort: string }> | null>
  mounts: Array<{
    Type: string
    Source: string
    Destination: string
    Mode: string
    RW: boolean
  }>
  environment: string[]
}

export type ContainerStats = {
  id: string
  read: string
  cpuPercent: number
  memoryUsage: number
  memoryLimit: number
  blockReadBytes: number
  blockWriteBytes: number
  networkRxBytes: number
  networkTxBytes: number
}

export type ProxyResource = {
  id: string
  subdomain: string
  tls: string
  sourceUrl: string
  createdAt: string
  updatedAt: string
  certificate: CertificateStatus
}

export type ViewMode = "cards" | "table"

export type DomainSettings = {
  domain: string
  customDomain: string | null
  generatedDomain: string
}

export type DomainReachability = {
  hostname: string
  expectedTarget: string
  dns: {
    configured: boolean
    target: string | null
    error: string | null
  }
  http: ProtocolReachability
  https: ProtocolReachability
}

export type PolicyResource = {
  id: string
  name: string
  allowedIps: string[]
  tailscaleDevices: Array<{
    id: string
    name: string
    address: string
  }>
  createdAt: string
  updatedAt: string
}

export type TailscaleSettings = {
  clientId: string
  clientSecretConfigured: boolean
}

export type TailscaleDevice = {
  id: string
  name: string
  hostname: string
  addresses: string[]
  os: string
  lastSeen: string
}

type ProtocolReachability = {
  reachable: boolean
  statusCode: number | null
  error: string | null
}
