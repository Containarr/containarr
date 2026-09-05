# Project instructions

Be honest, direct, and to the point. No fluff.

When coding, avoid helper functions whenever possible, and don't be afraid of code duplication.

## Screenshots

* Store Containarr desktop screenshots in `screenshots/`. Do not change mobile screenshots unless requested.
* Inspect the existing screenshots before replacing them. Preserve their filenames so README links keep working, and add screenshots for user-visible functionality introduced since the previous capture.
* Every screenshot must have exactly the same dimensions: **2732 × 2048 pixels**, with the layout of a **1366 × 1024 desktop viewport rendered at 2×**. Render text and UI at that scale; do not enlarge a 1× image after capture. Use a fixed viewport capture, not variable-height full-page screenshots. Verify every PNG's actual dimensions before finishing.
* A verified capture method is Chrome DevTools device toolbar: choose Responsive, set width **1366**, height **1024**, and device pixel ratio **2**, then use **Capture screenshot**. Save the native PNG. Browser preview scale does not determine output resolution. Check the PNG signature as well as dimensions; renaming a JPEG to `.png` is not a valid conversion. Do not use CSS zoom to simulate Retina rendering.
* Temporarily enable `CONTAINARR_DEMO_MODE=true` in `docker-compose.dev.yml` and run the current checkout with Docker Compose. Demo mode supplies example certificate status, domain checks, and container metrics. Revert demo mode and restore the normal runtime configuration after capturing, before committing or deploying.
* Match the original installed apps: **Homey, Pi-hole, Plex Media Server, Prowlarr, qBittorrent, Radarr, and Sonarr**. Confirm all seven are running before capturing the Apps page. Use `mydomain.com` for the example domain and match the existing dark theme.
* Use separate demo data and volumes when preparing examples. Preserve existing app data, credentials, and normal configuration. Do not expose passwords, tokens, private keys, or private notification destinations in screenshots. Keep illustrative event history confined to demo data.
* Wait for app icons, data, charts, and dialogs to finish loading. Inspect the resulting images for clipping, missing content, errors, and unexpected scroll positions. Capture the relevant new dialogs and settings as well as top-level pages.
* Remove temporary capture-only styling or rendering overrides after taking screenshots. Include a matching `CHANGELOG.md` entry for the refreshed screenshots.

## Changelog

Every user-visible addition, fix, change, or removal must include a matching entry in CHANGELOG.md in the same change. Do not finish a task with undocumented user-visible changes.

Use exactly this structure, with staged entries under `# Next` followed by released versions, newest first. Omit `# Next` when there are no staged entries:

```markdown
# Next

* Added ...
* Fixed ...

# v1.2.3

* Added ...
* Fixed ...
* Removed ...
```

Use concise, user-facing bullets starting with Added, Fixed, Changed, or Removed. Omit categories that do not apply. Preserve previous releases and do not invent historical changes.

Add entries under `# Next` during development; do not add staged changes to an already-released version. The first released version heading must match the root package.json version. When releasing a new version, rename `# Next` to `# v<new version>` and update package.json/package-lock.json together. Do not bump the version unless requested.

The Updates page fetches this file from the public URL configured by CONTAINARR_CHANGELOG_URL. Keep the Markdown compatible with the HTML-disabled renderer; do not rely on embedded HTML.
