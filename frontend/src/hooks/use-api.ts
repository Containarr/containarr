import { useCallback, useEffect, useState } from "react"

import { apiRequest } from "@/lib/api"

type ApiState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: T; error: null }
  | { status: "error"; data: null; error: string }

const MINIMUM_LOADING_TIME = 200
const responseCache = new Map<string, unknown>()
let cacheGeneration = 0

export function clearApiCache() {
  responseCache.clear()
  cacheGeneration += 1
}

export function cacheApiResponse<T>(path: string, data: T) {
  responseCache.set(path, data)
}

export function useApi<T>(
  path: string,
  { pollInterval = 0 }: { pollInterval?: number } = {}
) {
  const [state, setState] = useState<ApiState<T>>(() => cachedState<T>(path))

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const startedAt = Date.now()
      const generation = cacheGeneration
      const hadCachedResponse = responseCache.has(path)

      if (!hadCachedResponse) {
        setState({ status: "loading", data: null, error: null })
      }

      try {
        const data = await apiRequest<T>(path, { signal })
        if (generation !== cacheGeneration) return

        responseCache.set(path, data)
        if (!hadCachedResponse) {
          await waitForMinimumLoadingTime(startedAt)
        }
        if (signal?.aborted || generation !== cacheGeneration) return

        setState({ status: "success", data, error: null })
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        if (generation !== cacheGeneration || hadCachedResponse) return

        await waitForMinimumLoadingTime(startedAt)
        if (signal?.aborted || generation !== cacheGeneration) return

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
    setState(cachedState<T>(path))

    const controller = new AbortController()
    void load(controller.signal)
    const interval = pollInterval
      ? window.setInterval(() => void load(), pollInterval)
      : null

    return () => {
      controller.abort()
      if (interval !== null) window.clearInterval(interval)
    }
  }, [load, path, pollInterval])

  return { ...state, reload: () => void load() }
}

function cachedState<T>(path: string): ApiState<T> {
  if (!responseCache.has(path)) {
    return { status: "loading", data: null, error: null }
  }

  return {
    status: "success",
    data: responseCache.get(path) as T,
    error: null,
  }
}

async function waitForMinimumLoadingTime(startedAt: number) {
  const remaining = MINIMUM_LOADING_TIME - (Date.now() - startedAt)
  if (remaining > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, remaining))
  }
}
