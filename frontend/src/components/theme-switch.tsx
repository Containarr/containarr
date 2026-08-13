import { Monitor, Moon, Sun } from "lucide-react"

import { useTheme, type Theme } from "@/hooks/use-theme"
import { cn } from "@/lib/utils"

export function ThemeSwitch() {
  const [theme, setTheme] = useTheme()
  const options: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
    { value: "light", label: "Light", icon: Sun },
    { value: "system", label: "System", icon: Monitor },
    { value: "dark", label: "Dark", icon: Moon },
  ]

  return (
    <div className="flex rounded-lg border bg-background/60 p-0.5">
      {options.map(({ icon: Icon, label, value }) => (
        <button
          key={value}
          type="button"
          title={label}
          aria-label={`${label} theme`}
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
          className={cn(
            "flex h-7 flex-1 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground",
            theme === value && "bg-muted text-foreground shadow-xs"
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  )
}
