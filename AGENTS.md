# Project instructions

Be honest, direct, and to the point. No fluff.

When coding, avoid helper functions whenever possible, and don't be afraid of code duplication.

## Changelog

Every user-visible addition, fix, change, or removal must include a matching entry in CHANGELOG.md in the same change. Do not finish a task with undocumented user-visible changes.

Use exactly this structure, with the newest version first:

```markdown
# v1.2.3

* Added ...
* Fixed ...
* Removed ...
```

Use concise, user-facing bullets starting with Added, Fixed, Changed, or Removed. Omit categories that do not apply. Preserve previous releases and do not invent historical changes.

The top version heading must match the root package.json version. Add entries to that section during development. When releasing a new version, update package.json/package-lock.json and create or update the matching changelog section together. Do not bump the version unless requested.

The Updates page fetches this file from the public URL configured by CONTAINARR_CHANGELOG_URL. Keep the Markdown compatible with the HTML-disabled renderer; do not rely on embedded HTML.
