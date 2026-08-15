import { useEffect, useState } from "react"
import { Container } from "lucide-react"

import { cn } from "@/lib/utils"

const STORAGE_KEY = "containarr-dockerhub-avatars"
const pendingAvatars = new Map<string, Promise<string | null>>()

type ContainerAvatarProps = {
  alt: string
  appId?: string | null
  className?: string
  image: string
}

export function ContainerAvatar({
  alt,
  appId,
  className,
  image,
}: ContainerAvatarProps) {
  const owner = getDockerHubOwner(image)
  const appLogoUrl = appId ? `/api/v1/app/${appId}/logo` : null
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() =>
    owner ? getCachedAvatar(owner) : null
  )
  const [failedAppLogo, setFailedAppLogo] = useState<string | null>(null)
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null)

  useEffect(() => {
    setAvatarUrl(owner ? getCachedAvatar(owner) : null)

    if (
      (appLogoUrl && failedAppLogo !== appLogoUrl)
      || !owner
      || getCachedAvatar(owner)
    ) return

    let active = true
    void loadDockerHubAvatar(owner).then((url) => {
      if (active) setAvatarUrl(url)
    })

    return () => {
      active = false
    }
  }, [appLogoUrl, failedAppLogo, owner])

  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-card p-1.5 text-card-foreground shadow-xs",
        className
      )}
    >
      {appLogoUrl && failedAppLogo !== appLogoUrl ? (
        <img
          src={appLogoUrl}
          alt={alt}
          className="size-full object-contain"
          onError={() => setFailedAppLogo(appLogoUrl)}
        />
      ) : avatarUrl && failedAvatar !== avatarUrl ? (
        <img
          src={avatarUrl}
          alt={alt}
          className="size-full object-contain"
          referrerPolicy="no-referrer"
          onError={() => setFailedAvatar(avatarUrl)}
        />
      ) : (
        <Container className="size-1/2" aria-hidden="true" />
      )}
    </div>
  )
}

function getDockerHubOwner(image: string) {
  const name = image.trim().split("@", 1)[0]
  const parts = name.split("/").filter(Boolean)

  if (parts.length === 0) return null

  const first = parts[0].toLowerCase()
  const explicitDockerHub = [
    "docker.io",
    "index.docker.io",
    "registry-1.docker.io",
  ].includes(first)

  if (explicitDockerHub) parts.shift()
  else if (first === "localhost" || first.includes(".") || first.includes(":")) {
    return null
  }

  if (parts.length === 0) return null
  return parts.length === 1 ? "library" : parts[0]
}

function loadDockerHubAvatar(owner: string) {
  const pending = pendingAvatars.get(owner)
  if (pending) return pending

  const request = fetch(
    `/api/v1/container/dockerhub/users/${encodeURIComponent(owner)}`
  )
    .then(async (response) => {
      if (!response.ok) return null
      const user = (await response.json()) as { gravatar_url?: unknown }
      if (typeof user.gravatar_url !== "string" || !user.gravatar_url) return null

      const url = user.gravatar_url.startsWith("//")
        ? `https:${user.gravatar_url}`
        : user.gravatar_url
      cacheAvatar(owner, url)
      return url
    })
    .catch(() => null)
    .finally(() => pendingAvatars.delete(owner))

  pendingAvatars.set(owner, request)
  return request
}

function getCachedAvatar(owner: string) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") as Record<
      string,
      unknown
    >
    return typeof cached[owner] === "string" ? cached[owner] : null
  } catch {
    return null
  }
}

function cacheAvatar(owner: string, url: string) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") as Record<
      string,
      unknown
    >
    cached[owner] = url
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cached))
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}
