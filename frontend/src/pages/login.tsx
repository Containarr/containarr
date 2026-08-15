import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"

import { AuthLogo } from "@/components/auth-logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/use-auth"

export function LoginPage() {
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await login({ username, password })
      navigate("/apps", { replace: true })
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Sign in failed."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/25 p-5">
      <Card className="relative mt-14 w-full max-w-sm shadow-lg">
        <AuthLogo
          passwordFocused={passwordFocused}
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2"
        />

        <CardHeader className="items-center px-6 pt-20 text-center">
          <div>
            <CardTitle className="text-xl font-semibold tracking-tight">
              Sign in to Containarr
            </CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your credentials to continue.
            </p>
          </div>
        </CardHeader>

        <CardContent className="px-6 pt-6 pb-7">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm font-medium">
                Username
              </label>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                disabled={submitting}
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            <Button type="submit" className="mt-2 w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
