# v0.53.0

* Removed automatic backups after configuration changes. Saving backup settings now starts a new interval without running a backup.
* Removed the interval-reset explanation from the Backups page.
* Changed app volumes to a sortable table showing host path, container path, on-demand size calculation, and permissions.
* Added a sortable Include in Backup column to app volumes showing each volume’s saved backup selection.
* Changed app environment variables and devices to matching sortable tables showing names and values, or host paths, container paths, and device permissions.

# v0.52.0

* Added /24 firewall suggestions alongside /16 suggestions for local networks.
* Changed firewall IP ranges to appear in tooltips on hover or keyboard focus.

# v0.51.0

* Added a sortable Memory column to the Containers table, with live usage and an unavailable indicator when memory statistics cannot be read.

# v0.50.0

* Added per-volume “Include in Backup” icon toggles with tooltips and green enabled states when adding or editing apps, with selected user data archived alongside the database.
* Added automatic backups every 6 hours by default, with a configurable interval that persists across restarts. Configuration changes always trigger a backup.

# v0.49.0

* Changed app image update controls to show the status beneath Auto-update and display "Updating..." on the button while applying an update.

# v0.48.0

* Added click-to-upload and drag-and-drop editing on the app page icon, with hover overlays and automatic saving.

# v0.47.0

* Changed the app page to hide image update controls for local image IDs.

# v0.46.0

* Changed host and device file browsing to use a lightweight directory listing instead of starting Node.js for each request.
* Changed New/Edit app path fields to open the file browser only from the folder icon, with a hover state.

# v0.45.0

* Fixed invalid Docker image references being saved and image request or download errors crashing Containarr.
* Changed desktop screenshots to show the current interface and newly added features.

# v0.44.0

* Changed the Add to Home Screen icon to use the iOS logo and padding with a transparent background.
* Changed the changelog to keep staged entries under Next until release.

# v0.43.0

* Added `npm run serve:frontend` to start the frontend development server from the project root with network access enabled.
* Added swipe gestures to open and close the navigation drawer in the iOS Home Screen app when the hamburger menu is visible.

# v0.42.0

* Changed apps with automatic updates enabled to skip update-available notifications.
* Fixed app notifications to open the app’s page and Containarr update notifications to open the Updates page.

# v0.41.0

* Changed the Changelog heading to sit outside the scrollable panel and match the Events page section titles, removing the nested card.

# v0.40.0

* Added an always-visible, scrollable changelog below the update card on the Updates page.
* Added the CONTAINARR_CHANGELOG_URL environment variable to configure the public Markdown changelog URL.

# v0.39.0

* Added an Events page with app and Containarr update history, webhooks, and push notifications.
