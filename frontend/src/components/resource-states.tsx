import type { ReactNode } from "react"
import { CircleAlert, Inbox } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function CardGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card key={index} className="gap-5 p-5 shadow-none">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
          <Skeleton className="h-16 w-full" />
        </Card>
      ))}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <Card className="border-dashed bg-muted/20 shadow-none">
      <CardContent className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-4 flex size-11 items-center justify-center rounded-full border bg-background">
          <Inbox className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="max-w-sm text-sm text-muted-foreground">{children}</p>
      </CardContent>
    </Card>
  )
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <Card className="border-red-200 bg-red-50 shadow-none">
      <CardContent className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-red-100">
          <CircleAlert className="size-5 text-destructive" aria-hidden="true" />
        </div>
        <p className="font-medium">Unable to load data</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
        <Button className="mt-5" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Card>
  )
}
