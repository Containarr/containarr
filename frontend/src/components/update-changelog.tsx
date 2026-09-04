import { Button } from "@/components/ui/button"
import { useApi } from "@/hooks/use-api"

export function UpdateChangelog() {
  const changelog = useApi<{ html: string }>("/api/v1/update/changelog", {
    pollInterval: 1000 * 60 * 60,
  })

  return (
    <div className="space-y-3">
      <h2 id="changelog-heading" className="font-medium">Changelog</h2>
      {changelog.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">Loading changelog…</p>
      ) : changelog.status === "error" ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-muted-foreground">{changelog.error}</p>
          <Button type="button" variant="outline" onClick={changelog.reload}>
            Retry Changelog
          </Button>
        </div>
      ) : (
        <div
          role="region"
          aria-labelledby="changelog-heading"
          tabIndex={0}
          className="max-h-80 overflow-y-auto overscroll-contain rounded-xl border bg-muted/30 p-4 text-sm leading-relaxed break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-lg [&_h1]:font-semibold [&_h1:first-child]:mt-0 [&_h2]:my-3 [&_h2]:font-semibold [&_h3]:my-3 [&_h3]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_p]:my-3 [&_a]:underline [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_code]:font-mono [&_blockquote]:border-l-2 [&_blockquote]:pl-3"
          dangerouslySetInnerHTML={{ __html: changelog.data.html }}
        />
      )}
    </div>
  )
}
