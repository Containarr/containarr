import { useId } from "react"
import type { LucideIcon } from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export type MetricPoint = {
  timestamp: number
  [key: string]: number
}

export type MetricSeries = {
  key: string
  label: string
  color: string
}

export function MetricChart({
  data,
  domain,
  formatValue,
  icon: Icon,
  series,
  title,
  value,
}: {
  data: MetricPoint[]
  domain?: [number | "auto", number | "auto"]
  formatValue: (value: number) => string
  icon: LucideIcon
  series: MetricSeries[]
  title: string
  value: string
}) {
  const gradientPrefix = useId().replace(/:/g, "")
  const latest = data.at(-1)

  return (
    <Card className="overflow-hidden shadow-none">
      <CardHeader>
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Icon className="size-4" aria-hidden="true" />
            {title}
          </p>
          <CardTitle className="mt-1.5 text-xl">{value}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="mt-4 px-2 pb-3">
        <div
          className="h-36 w-full [&_.recharts-surface:focus]:outline-none"
          role="img"
          aria-label={`${title} activity over the last minute`}
        >
          {data.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                accessibilityLayer
                data={data}
                margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
              >
                <defs>
                  {series.map((item) => (
                    <linearGradient
                      key={item.key}
                      id={`${gradientPrefix}-${item.key}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor={item.color} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={item.color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" opacity={0.7} />
                <XAxis
                  dataKey="timestamp"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={36}
                  tickMargin={8}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickFormatter={(timestamp) => formatTime(Number(timestamp))}
                />
                <YAxis hide domain={domain ?? [0, "auto"]} />
                <Tooltip
                  cursor={{ stroke: "var(--border)" }}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    color: "var(--card-foreground)",
                    fontSize: 12,
                  }}
                  itemStyle={{ color: "var(--card-foreground)" }}
                  labelFormatter={(label) => formatTime(Number(label), true)}
                  formatter={(entry, name) => [
                    formatValue(Number(entry)),
                    series.find((item) => item.key === name)?.label ?? name,
                  ]}
                />
                {series.map((item) => (
                  <Area
                    key={item.key}
                    type="monotone"
                    dataKey={item.key}
                    stroke={item.color}
                    strokeWidth={2}
                    fill={`url(#${gradientPrefix}-${item.key})`}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Collecting data…
            </div>
          )}
        </div>
        {series.length > 1 && latest ? (
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-2 pt-1 text-[11px] text-muted-foreground">
            {series.map((item) => (
              <span key={item.key} className="inline-flex items-center gap-1.5">
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label} {formatValue(latest[item.key] ?? 0)}
              </span>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function formatTime(value: number, withSeconds = false) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  }).format(value)
}
