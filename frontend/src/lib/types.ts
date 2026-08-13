export type AppResource = {
  id: string
  name: string | null
  subdomain: string | null
  state: string
  port: number | null
  url: string | null
  registryId: string | null
  registryVersion: number | null
  tls: string
  containerId: string | null
  containerState: string | null
  dockerImage: string
  dockerNetworkMode: "bridge" | "host"
  dockerVolumes: string[]
  dockerPorts: DockerPort[]
  dockerEnvironment: Record<string, string>
  dockerPrivileged: boolean
  dockerCapabilities: string[]
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

export type ViewMode = "cards" | "table"
