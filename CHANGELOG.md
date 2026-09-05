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
