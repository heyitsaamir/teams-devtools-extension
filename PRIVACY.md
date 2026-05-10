# Privacy Policy

Effective date: May 10, 2026

Teams DevTools Extension is an independent browser DevTools extension for inspecting Microsoft Teams bot traffic locally in your browser.

This project is not affiliated with, endorsed by, sponsored by, or supported by Microsoft.

## Data the extension can access

When enabled on Microsoft Teams web domains, the extension can inspect Teams page traffic that is visible to the browser, including WebSocket, worker, and fetch traffic. This may include message content, sender/display names, conversation identifiers, URLs, request/response payloads, and other Teams traffic metadata shown in the DevTools panel.

## Data stored by the extension

The extension uses local browser storage only to remember user-entered filter settings, such as the optional bot client ID and recent bot IDs.

The extension does not store captured Teams traffic.

## Data sharing

The extension does not send captured traffic, filter settings, or any other data to external servers.

The extension does not sell, share, or transfer user data to third parties.

## Data retention

Filter settings are retained locally in the browser until the user clears extension storage, removes the extension, or overwrites the saved settings.

Captured traffic is held only in memory for display in the DevTools panel and is cleared when the user clears the panel, stops the session, refreshes the page, closes DevTools, or unloads the extension context.

## Permissions

The extension requests access to Microsoft Teams web domains so it can inspect Teams bot traffic locally in the DevTools panel.

The extension requests browser storage permission to remember optional filter settings entered by the user.

## Contact

For questions or issues, open an issue at:

https://github.com/heyitsaamir/teams-devtools-extension/issues
