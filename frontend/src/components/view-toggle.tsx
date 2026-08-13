import { Grid2X2, List } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ViewMode } from "@/lib/types"

export function ViewToggle({
  onChange,
  value,
}: {
  onChange: (view: ViewMode) => void
  value: ViewMode
}) {
  return (
    <div className="hidden items-center rounded-lg border bg-card p-0.5 shadow-xs sm:flex">
      {([
        { value: "cards" as const, label: "Cards", icon: Grid2X2 },
        { value: "table" as const, label: "Table", icon: List },
      ]).map(({ icon: Icon, label, value: option }) => (
        <button
          key={option}
          type="button"
          aria-label={`${label} view`}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
            value === option && "bg-muted text-foreground shadow-xs"
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
