import { apiRequest } from "@/lib/api"
import type { DomainReachability } from "@/lib/types"

export const DOMAIN_CONNECTION_CHECKED_EVENT =
  "containarr:domain-connection-checked"

export type DomainConnectionChecked = {
  checkId: number
  domain: string
  failed: boolean
}

const CACHE_DURATION = 1000 * 60 * 15
let nextCheckId = 0
let pendingCheck: { domain: string; result: Promise<DomainReachability> } | null =
  null
const latestCheckByDomain = new Map<string, number>()

export function checkDomainConnection(
  domain: string,
  {
    force = false,
    signal,
  }: { force?: boolean; signal?: AbortSignal } = {}
) {
  const cacheKey = `containarr-domain-connection:${domain}`

  if (!force) {
    let cached: {
      checkedAt: number
      reachability: DomainReachability | null
      error: string | null
    } | null = null
    try {
      cached = JSON.parse(window.localStorage.getItem(cacheKey) ?? "null")
    } catch {
      // Ignore invalid or unavailable browser storage.
    }

    if (
      cached &&
      typeof cached.checkedAt === "number" &&
      Date.now() - cached.checkedAt < CACHE_DURATION
    ) {
      const checkId = ++nextCheckId
      latestCheckByDomain.set(domain, checkId)
      window.dispatchEvent(
        new CustomEvent<DomainConnectionChecked>(
          DOMAIN_CONNECTION_CHECKED_EVENT,
          {
            detail: {
              checkId,
              domain,
              failed: cached.error !== null ||
                !cached.reachability?.http.reachable ||
                !cached.reachability?.https.reachable,
            },
          }
        )
      )

      if (cached.error) return Promise.reject(new Error(cached.error))
      if (cached.reachability) return Promise.resolve(cached.reachability)
    }

    if (pendingCheck?.domain === domain) return pendingCheck.result
  }

  const checkId = ++nextCheckId
  latestCheckByDomain.set(domain, checkId)
  const result = apiRequest<DomainReachability>("/api/v1/ddns/domain/check", {
    method: "POST",
    body: JSON.stringify({ domain }),
    signal,
  })
    .then((reachability) => {
      if (latestCheckByDomain.get(domain) === checkId) {
        try {
          window.localStorage.setItem(
            cacheKey,
            JSON.stringify({
              checkedAt: Date.now(),
              reachability,
              error: null,
            })
          )
        } catch {
          // Continue without a persistent browser cache.
        }
        window.dispatchEvent(
          new CustomEvent<DomainConnectionChecked>(
            DOMAIN_CONNECTION_CHECKED_EVENT,
            {
              detail: {
                checkId,
                domain,
                failed:
                  !reachability.http.reachable ||
                  !reachability.https.reachable,
              },
            }
          )
        )
      }
      return reachability
    })
    .catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error
      }

      const message =
        error instanceof Error ? error.message : "Connection check failed."
      if (latestCheckByDomain.get(domain) === checkId) {
        try {
          window.localStorage.setItem(
            cacheKey,
            JSON.stringify({
              checkedAt: Date.now(),
              reachability: null,
              error: message,
            })
          )
        } catch {
          // Continue without a persistent browser cache.
        }
        window.dispatchEvent(
          new CustomEvent<DomainConnectionChecked>(
            DOMAIN_CONNECTION_CHECKED_EVENT,
            {
              detail: { checkId, domain, failed: true },
            }
          )
        )
      }
      throw error
    })
    .finally(() => {
      if (pendingCheck?.result === result) pendingCheck = null
    })

  if (!force) pendingCheck = { domain, result }
  return result
}
