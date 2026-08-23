export async function apiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    if (response.status === 401) {
      window.dispatchEvent(new Event("containarr:unauthorized"))
    }

    let message = ""
    try {
      const body = JSON.parse(detail) as { error?: unknown }
      if (typeof body.error === "string") message = body.error
    } catch {
      if (!detail.trimStart().startsWith("<")) message = detail
    }

    throw new Error(
      message || `The server returned ${response.status} ${response.statusText}.`
    )
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
