import { useState } from "react"
import { Link } from "react-router-dom"
import { PageHeader } from "@/components/page-header"
import { ErrorState } from "@/components/resource-states"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useApi } from "@/hooks/use-api"
import { apiRequest } from "@/lib/api"
import { PolicyField } from "@/components/install-app-dialog"

type AdminSettings = { url: string; policyId: string }

export function AdminPage() {
  const admin = useApi<AdminSettings>("/api/v1/admin")
  const [policyId, setPolicyId] = useState<string | null>(null)
  const [savedPolicyId, setSavedPolicyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (admin.status === "error") return <ErrorState message={admin.error} onRetry={admin.reload} />

  return (
    <section>
      <PageHeader title="Admin" description="Configure access to the Containarr admin UI." />
      {admin.status === "success" ? (
        <Card className="mt-8 max-w-3xl">
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-2">
              <label htmlFor="admin-url" className="text-sm font-medium">Admin URL</label>
              <Input id="admin-url" value={admin.data.url} disabled />
              <p className="text-sm text-muted-foreground">This address is determined by your <Link to="/domain" className="text-primary underline underline-offset-4">domain</Link> and cannot be changed here.</p>
            </div>
            <form className="space-y-4" onSubmit={async event => {
              event.preventDefault()
              setSaving(true)
              setError(null)
              try {
                const result = await apiRequest<AdminSettings>("/api/v1/admin", {
                  method: "PUT",
                  body: JSON.stringify({ policyId: policyId ?? savedPolicyId ?? admin.data.policyId }),
                })
                setSavedPolicyId(result.policyId)
              } catch (error) {
                setError(error instanceof Error ? error.message : "Unable to save admin settings.")
              } finally {
                setSaving(false)
              }
            }}>
              <div className="space-y-2">
                <fieldset disabled={saving}>
                  <PolicyField value={policyId ?? savedPolicyId ?? admin.data.policyId} onChange={value => {
                    setPolicyId(value)
                  }} />
                </fieldset>
                <p className="text-sm text-muted-foreground">Controls access to the admin URL. Local network access remains available.</p>
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end border-t pt-4">
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : <p className="mt-8 text-sm text-muted-foreground">Loading admin settings…</p>}
    </section>
  )
}
