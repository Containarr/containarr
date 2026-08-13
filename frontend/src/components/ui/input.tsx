import type { InputHTMLAttributes } from "react"

import { cn } from "@/lib/utils"

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg border bg-background px-3 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus:border-foreground/30 focus:ring-2 focus:ring-ring/30 disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}
