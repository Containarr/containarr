import { useState, type FormEvent } from "react"
import { ArrowRight, Eye, EyeOff } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { AuthLogo } from "@/components/auth-logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/use-auth"

export function OnboardingPage() {
  const [started, setStarted] = useState(false)

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/25 p-5">
      {started ? (
        <AccountStep />
      ) : (
        <WelcomeStep onContinue={() => setStarted(true)} />
      )}
    </main>
  )
}

function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <Card className="relative mt-14 w-full max-w-md shadow-lg">
      <AuthLogo className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      <CardHeader className="items-center px-7 pt-20 text-center">
        <CardTitle className="text-2xl font-semibold tracking-tight">
          Welcome to Containarr
        </CardTitle>
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          Let&apos;s secure your Control Center by creating its administrator
          account.
        </p>
      </CardHeader>
      <CardContent className="px-7 pt-6 pb-7">
        <Button type="button" className="w-full" onClick={onContinue}>
          Get started
          <ArrowRight className="ml-2 size-4" />
        </Button>
      </CardContent>
    </Card>
  )
}

function AccountStep() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { onboard, completeOnboarding } = useAuth()
  const navigate = useNavigate()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      completeOnboarding(await onboard({ username, password }))
      navigate("/apps", { replace: true })
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Account creation failed."
      )
      setSubmitting(false)
    }
  }

  return (
    <Card className="relative mt-14 w-full max-w-sm shadow-lg">
      <AuthLogo
        passwordFocused={passwordFocused}
        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2"
      />
      <CardHeader className="items-center px-6 pt-20 text-center">
        <CardTitle className="text-xl font-semibold tracking-tight">
          Create your Account
        </CardTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          This account will have full access to Containarr.
        </p>
      </CardHeader>

      <CardContent className="px-6 pt-6 pb-7">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="onboarding-username" className="block h-5 text-sm font-medium">
              Username
            </label>
            <Input
              id="onboarding-username"
              name="username"
              type="text"
              autoComplete="username"
              minLength={3}
              maxLength={64}
              required
              placeholder="admin"
              className="mt-1.5"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={submitting}
            />
          </div>

          <div>
            <div className="flex h-5 items-center justify-between gap-3">
              <label htmlFor="onboarding-password" className="text-sm font-medium">
                Password
              </label>
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                aria-pressed={showPassword}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? (
                  <EyeOff className="size-3.5" />
                ) : (
                  <Eye className="size-3.5" />
                )}
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <Input
              id="onboarding-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              maxLength={1024}
              required
              placeholder="Enter a password"
              className="mt-1.5"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              disabled={submitting}
            />
            <p className="mt-2.5 text-xs text-muted-foreground">
              Use at least 8 characters.
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
