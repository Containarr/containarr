import { Badge } from "@/components/ui/badge"

const healthyStates = new Set(["running"])
const transitionalStates = new Set([
  "created",
  "creating",
  "provisioning",
  "removing",
  "renewing",
  "restarting",
  "starting",
])

export function StatusBadge({
  label,
  state,
}: {
  label?: string
  state: string | null
}) {
  const normalized = (state || "unknown").toLowerCase()
  const isHealthy = healthyStates.has(normalized)
  const isTransitional = transitionalStates.has(normalized)
  const isStopped = ["stopped", "exited", "paused"].includes(normalized)
  const isError = ["dead", "error"].includes(normalized)

  return (
    <Badge
      variant="outline"
      className={
        isHealthy
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
          : isTransitional
            ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
            : isStopped
              ? "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/70 dark:text-orange-300"
              : isError
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/70 dark:text-red-300"
                : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/70 dark:text-sky-300"
      }
    >
      <span
        className={`size-1.5 rounded-full ${
          isHealthy
            ? "bg-emerald-500"
            : isTransitional
              ? "bg-amber-500"
              : isStopped
                ? "bg-orange-500"
                : isError
                  ? "bg-red-500"
                  : "bg-current opacity-60"
        }`}
        aria-hidden="true"
      />
      <span className="relative -top-px">{label ?? normalized}</span>
    </Badge>
  )
}
