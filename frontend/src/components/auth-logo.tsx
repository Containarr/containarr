import { cn } from "@/lib/utils"

export function AuthLogo({
  passwordFocused = false,
  className,
}: {
  passwordFocused?: boolean
  className?: string
}) {
  return (
    <div className={cn("relative size-28", className)} aria-hidden="true">
      <img
        src="/logo.svg"
        alt=""
        className={cn(
          "absolute inset-0 size-full object-contain transition-opacity duration-150",
          passwordFocused ? "opacity-0" : "opacity-100"
        )}
      />
      <img
        src="/logo-password.svg"
        alt=""
        className={cn(
          "absolute inset-0 size-full object-contain transition-opacity duration-150",
          passwordFocused ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  )
}
