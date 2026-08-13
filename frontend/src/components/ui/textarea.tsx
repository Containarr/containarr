import type { TextareaHTMLAttributes } from "react"

import { cn } from "@/lib/utils"

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus:border-foreground/30 focus:ring-2 focus:ring-ring/30 disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}
