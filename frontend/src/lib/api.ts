export async function apiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(
      detail || `The server returned ${response.status} ${response.statusText}.`
    )
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
