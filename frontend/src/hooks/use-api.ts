import { useCallback, useEffect, useState } from "react"

import { apiRequest } from "@/lib/api"

type ApiState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: T; error: null }
  | { status: "error"; data: null; error: string }

export function useApi<T>(
  path: string,
  { pollInterval = 0 }: { pollInterval?: number } = {}
) {
  const [state, setState] = useState<ApiState<T>>({
    status: "loading",
    data: null,
    error: null,
  })

  const load = useCallback(
    async (signal?: AbortSignal, silent = false) => {
      if (!silent) setState({ status: "loading", data: null, error: null })

      try {
        setState({
          status: "success",
          data: await apiRequest<T>(path, { signal }),
          error: null,
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        if (silent) return

        setState({
          status: "error",
          data: null,
          error:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred.",
        })
      }
    },
    [path]
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    const interval = pollInterval
      ? window.setInterval(() => void load(undefined, true), pollInterval)
      : null

    return () => {
      controller.abort()
      if (interval !== null) window.clearInterval(interval)
    }
  }, [load, pollInterval])

  return { ...state, reload: () => void load() }
}
