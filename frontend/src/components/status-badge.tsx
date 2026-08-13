import { Badge } from "@/components/ui/badge"

const healthyStates = new Set(["running", "created"])
const transitionalStates = new Set(["creating", "starting", "restarting"])

export function StatusBadge({ state }: { state: string | null }) {
  const normalized = (state || "unknown").toLowerCase()
  const isHealthy = healthyStates.has(normalized)
  const isTransitional = transitionalStates.has(normalized)
  const isStopped = ["stopped", "exited", "dead"].includes(normalized)

  return (
    <Badge
      variant="outline"
      className={
        isHealthy
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : isTransitional
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : isStopped
              ? "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              : "border-sky-200 bg-sky-50 text-sky-700"
      }
    >
      <span
        className={`size-1.5 rounded-full ${
          isHealthy
            ? "bg-emerald-500"
            : isTransitional
              ? "bg-amber-500"
              : "bg-current opacity-60"
        }`}
        aria-hidden="true"
      />
      <span className="relative -top-px">{normalized}</span>
    </Badge>
  )
}
