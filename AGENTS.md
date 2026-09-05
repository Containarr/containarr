# Project instructions

Be honest, direct, and to the point. No fluff.

When coding, avoid helper functions whenever possible, and don't be afraid of code duplication.

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
