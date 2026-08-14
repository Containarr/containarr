import { useState, type FormEvent } from "react"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { AuthLogo } from "@/components/auth-logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/use-auth"

export function OnboardingPage() {
  const [step, setStep] = useState<"welcome" | "account">("welcome")

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/25 p-5">
      {step === "welcome" ? (
        <WelcomeStep onContinue={() => setStep("account")} />
      ) : (
        <AccountStep onBack={() => setStep("welcome")} />
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

function AccountStep({ onBack }: { onBack: () => void }) {
  const [username, setUsername] = useState("admin")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { onboard } = useAuth()
  const navigate = useNavigate()

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setSubmitting(true)
    try {
      await onboard({ username, password })
      navigate("/apps", { replace: true })
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Account creation failed."
      )
    } finally {
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
          Create administrator
        </CardTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          This account will have full access to Containarr.
        </p>
      </CardHeader>

      <CardContent className="px-6 pt-6 pb-7">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="onboarding-username" className="text-sm font-medium">
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
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="onboarding-password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="onboarding-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={1024}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              Use at least 8 characters.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="onboarding-confirm-password"
              className="text-sm font-medium"
            >
              Confirm password
            </label>
            <Input
              id="onboarding-confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={1024}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
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

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={submitting}
              aria-label="Back"
            >
              <ArrowLeft className="size-4" />
            </Button>
            <Button type="submit" className="flex-1" disabled={submitting}>
              {submitting ? "Creating account…" : "Create account"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
