import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

import { apiRequest } from "@/lib/api"
import { clearApiCache } from "@/hooks/use-api"

export type AuthUser = {
  id: string
  username: string
}

export type AuthState = {
  onboardingRequired: boolean
  authenticated: boolean
  user: AuthUser | null
}

type AuthContextValue = {
  state:
    | { status: "loading"; data: null; error: null }
    | { status: "error"; data: null; error: string }
    | { status: "ready"; data: AuthState; error: null }
  reload: () => Promise<void>
  login: (credentials: { username: string; password: string }) => Promise<void>
  onboard: (credentials: { username: string; password: string }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthContextValue["state"]>({
    status: "loading",
    data: null,
    error: null,
  })

  const reload = useCallback(async () => {
    setState({ status: "loading", data: null, error: null })
    try {
      setState({
        status: "ready",
        data: await apiRequest<AuthState>("/api/v1/auth/state"),
        error: null,
      })
    } catch (error) {
      setState({
        status: "error",
        data: null,
        error: getErrorMessage(error),
      })
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    function unauthorized() {
      clearApiCache()
      setState((current) => ({
        status: "ready",
        data: {
          onboardingRequired:
            current.status === "ready"
              ? current.data.onboardingRequired
              : false,
          authenticated: false,
          user: null,
        },
        error: null,
      }))
    }

    window.addEventListener("containarr:unauthorized", unauthorized)
    return () =>
      window.removeEventListener("containarr:unauthorized", unauthorized)
  }, [])

  async function authenticate(
    path: "/api/v1/auth/login" | "/api/v1/auth/onboarding",
    credentials: { username: string; password: string }
  ) {
    const data = await apiRequest<AuthState>(path, {
      method: "POST",
      body: JSON.stringify(credentials),
    })
    clearApiCache()
    setState({ status: "ready", data, error: null })
  }

  async function logout() {
    await apiRequest<void>("/api/v1/auth/logout", { method: "POST" })
    clearApiCache()
    setState({
      status: "ready",
      data: {
        onboardingRequired: false,
        authenticated: false,
        user: null,
      },
      error: null,
    })
  }

  return (
    <AuthContext.Provider
      value={{
        state,
        reload,
        login: (credentials) =>
          authenticate("/api/v1/auth/login", credentials),
        onboard: (credentials) =>
          authenticate("/api/v1/auth/onboarding", credentials),
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider.")
  return context
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Authentication failed."
}
