import type { LucideIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function MetricChart({
  color,
  data,
  icon: Icon,
  title,
  value,
}: {
  color: string
  data: number[]
  icon: LucideIcon
  title: string
  value: string
}) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Icon className="size-4" aria-hidden="true" />
            {title}
          </p>
          <CardTitle className="mt-1.5 text-xl">{value}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="mt-5">
        <div
          className="flex h-20 items-end gap-1"
          role="img"
          aria-label={`${title} activity over the last twelve intervals`}
        >
          {data.map((point, index) => (
            <span
              key={index}
              className={`min-h-1 flex-1 rounded-sm ${color}`}
              style={{ height: `${point}%` }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
