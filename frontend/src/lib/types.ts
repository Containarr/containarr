export type AppResource = {
  id: string
  name: string | null
  subdomain: string | null
  state: string | null
  port: number | null
  url: string | null
  registryId: string | null
  registryVersion: number | null
  hasLogo: boolean
  tls: string
  containerId: string | null
  containerError: {
    containerId: string
    exitCode: number | null
    finishedAt: string
    logs: string
    message?: string
  } | null
  dockerImage: string
  autoUpdate: boolean
  disabled: boolean
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
  dockerNetworks: DockerNetworkAttachment[]
  dockerVolumes: string[]
  dockerDevices: string[]
  dockerPorts: DockerPort[]
  dockerEnvironment: Record<string, string>
  dockerUserId: number | null
  dockerGroupId: number | null
  dockerPrivileged: boolean
  dockerCapabilities: string[]
  certificate: CertificateStatus
}

export type AppConfiguration = Pick<
  AppResource,
  | "name"
  | "subdomain"
  | "port"
  | "tls"
  | "dockerImage"
  | "dockerNetworkMode"
  | "dockerNetworks"
  | "dockerVolumes"
  | "dockerDevices"
  | "dockerPorts"
  | "dockerEnvironment"
  | "dockerUserId"
  | "dockerGroupId"
  | "dockerPrivileged"
  | "dockerCapabilities"
  | "policyId"
>

export type CertificateStatus = {
  hostname: string | null
  status: "not_required" | "provisioning" | "renewing" | "ready" | "error"
  expiresAt: string | null
  error: string | null
}

export type ContainarrUpdateStatus = {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  checkedAt: string | null
  error: string | null
  installing: boolean
  installError: string | null
}

export type DockerPort = {
  host: number
  hostIp?: string
  container: number
  protocol: "tcp" | "udp"
}

export type DockerNetworkAttachment = {
  name: string
  aliases: string[]
}

export type RegistryApp = {
  category: string
  version: number
  name: string
  logoUrl: string
  port: number
  description: string
  website: string
  dockerImage: string
  dockerPorts: DockerPort[]
  dockerNetworkMode: "bridge" | "host"
  dockerVolumes: Record<string, string> | string[]
  dockerDevices?: Record<string, string> | string[]
  dockerEnvironment: Record<string, string>
  dockerUserId?: number | null
  dockerGroupId?: number | null
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
  protected: boolean
  deletable: boolean
  importable: boolean
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
  demoHistory?: Array<Omit<ContainerStats, "demoHistory">>
}

export type DockerImageResource = {
  id: string
  tags: string[]
  digests: string[]
  created: string
  size: number
  containers: Array<{
    id: string
    name: string
  }>
  labels: Record<string, string>
}

export type DockerVolumeResource = {
  name: string
  driver: string
  mountpoint: string
  created: string | null
  scope: string
  labels: Record<string, string>
  options: Record<string, string>
  size: number | null
  refCount: number | null
  containers: Array<{
    id: string
    name: string
  }>
  deletable: boolean
}

export type DockerNetworkResource = {
  id: string
  name: string
  driver: string
  scope: string
  created: string
  internal: boolean
  attachable: boolean
  ingress: boolean
  containers: Array<{
    id: string
    name: string
  }>
  deletable: boolean
  subnets: string[]
  labels: Record<string, string>
}

export type DockerCleanupResult = {
  deleted: unknown[]
  spaceReclaimed?: number
}

export type ProxyResource = {
  id: string
  subdomain: string
  tls: string
  sourceUrl: string
  policyId: string
  disabled: boolean
  createdAt: string
  updatedAt: string
  certificate: CertificateStatus
}

export type ViewMode = "cards" | "table"

export type DomainSettings = {
  domain: string
  customDomain: string | null
  generatedDomain: string
  httpPort: number
  httpsPort: number
  installationIp: string | null
}

export type BackupSettings = {
  repositoryUrl: string
  branch: string
  publicKey: string
  configured: boolean
  backingUp: boolean
  lastBackupAt: string | null
  error: string | null
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
  createdAt: string
  updatedAt: string
}

type ProtocolReachability = {
  reachable: boolean
  statusCode: number | null
  error: string | null
}
