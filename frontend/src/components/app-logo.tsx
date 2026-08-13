import { useEffect, useState } from "react"
import { Package } from "lucide-react"

import { cn } from "@/lib/utils"

type AppLogoProps = {
  alt: string
  appId?: string
  className?: string
  registryId?: string
}

export function AppLogo({
  alt,
  appId,
  className,
  registryId,
}: AppLogoProps) {
  const [failed, setFailed] = useState(false)
  const src = appId
    ? `/api/v1/app/${appId}/logo`
    : registryId
      ? `https://containarr.com/apps/${registryId}.png`
      : null

  useEffect(() => setFailed(false), [src])

  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-card p-1.5 text-card-foreground shadow-xs",
        className
      )}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          className="size-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Package className="size-5" aria-hidden="true" />
      )}
    </div>
  )
}
