import { useEffect, useState, type FormEvent } from "react"
import { Check, LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { apiRequest } from "@/lib/api"

export function ChangePasswordDialog({
  onClose,
  open,
}: {
  onClose: () => void
  open: boolean
}) {
  if (!open) return null
  return <ChangePasswordDialogContent onClose={onClose} />
}

function ChangePasswordDialogContent({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose()
    }

    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [onClose, saving])

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaved(false)
    setError(null)

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.")
      return
    }

    setSaving(true)
    try {
      await apiRequest<void>("/api/v1/auth/password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setSaved(true)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Password change failed."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        className="min-w-0 w-full max-w-md rounded-t-2xl border bg-background shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="change-password-title" className="font-semibold">
              Change Password
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Use at least 8 characters for your new password.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            disabled={saving}
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={changePassword}>
          <div className="space-y-4 p-5 sm:p-6">
            <div className="space-y-1.5">
              <label htmlFor="current-password" className="block text-sm font-medium">
                Current password
              </label>
              <Input
                id="current-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value)
                  setSaved(false)
                }}
                disabled={saving}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="new-password" className="block text-sm font-medium">
                New password
              </label>
              <Input
                id="new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value)
                  setSaved(false)
                }}
                disabled={saving}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm-password" className="block text-sm font-medium">
                Confirm new password
              </label>
              <Input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value)
                  setSaved(false)
                }}
                disabled={saving}
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            {saved && (
              <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                <Check className="size-4" />
                Password changed.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              {saved ? "Done" : "Cancel"}
            </Button>
            {!saved && (
              <Button type="submit" disabled={saving}>
                {saving && <LoaderCircle className="mr-2 size-4 animate-spin" />}
                {saving ? "Changing…" : "Change Password"}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
