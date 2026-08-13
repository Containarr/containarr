import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"

export type SortDirection = "asc" | "desc"

export function SortableTableHeader({
  active,
  align = "left",
  direction,
  label,
  onClick,
}: {
  active: boolean
  align?: "left" | "right"
  direction: SortDirection
  label: string
  onClick: () => void
}) {
  const Icon = active
    ? direction === "asc"
      ? ArrowUp
      : ArrowDown
    : ChevronsUpDown

  return (
    <th
      className="px-4 py-3 font-medium"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full cursor-pointer items-center gap-1.5 hover:text-foreground",
          align === "right" && "justify-end"
        )}
      >
        {label}
        <Icon className="size-3.5 opacity-70" aria-hidden="true" />
      </button>
    </th>
  )
}
