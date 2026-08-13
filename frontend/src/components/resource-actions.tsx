import { useState } from "react"
import { LoaderCircle, Play, RefreshCw, RotateCcw, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import { apiRequest } from "@/lib/api"

type Action = "start" | "stop" | "restart" | "recreate"

export function ResourceActions({
  id,
  kind,
  onComplete,
  recreate = false,
  state,
}: {
  id: string
  kind: "app" | "container"
  onComplete: () => void
  recreate?: boolean
  state: string | null
}) {
  const [pending, setPending] = useState<Action | null>(null)
  const [error, setError] = useState<string | null>(null)
  const running = state?.toLowerCase() === "running"

  async function run(action: Action) {
    setPending(action)
    setError(null)
    try {
      await apiRequest(`/api/v1/${kind}/${id}/${action}`, { method: "POST" })
      onComplete()
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Action failed."
      )
    } finally {
      setPending(null)
    }
  }

  const primaryAction: Action = running ? "stop" : "start"

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={running ? "outline" : "default"}
          disabled={pending !== null}
          onClick={() => void run(primaryAction)}
        >
          {pending === primaryAction ? (
            <LoaderCircle className="mr-2 size-4 animate-spin" />
          ) : running ? (
            <Square className="mr-2 size-3.5" />
          ) : (
            <Play className="mr-2 size-3.5" />
          )}
          {running ? "Stop" : "Start"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending !== null}
          onClick={() => void run("restart")}
        >
          {pending === "restart" ? (
            <LoaderCircle className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 size-3.5" />
          )}
          Restart
        </Button>
        {recreate && (
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null}
            onClick={() => void run("recreate")}
          >
            {pending === "recreate" ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 size-3.5" />
            )}
            Recreate
          </Button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
