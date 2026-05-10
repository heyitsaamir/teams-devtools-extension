# Teams DevTools Extension

Chrome DevTools extension for inspecting incoming and outgoing Microsoft Teams bot traffic.

## Development

```bash
npm install
npm run build
```

For watch mode:

```bash
npm run dev
```

## Load locally in Chrome / Edge

1. Run `npm run build`.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the generated `dist/` folder.
6. Open Microsoft Teams in the browser and then open DevTools.
7. Use the **Teams Bot** DevTools panel.

## Package for publishing

```bash
npm run zip
```

This creates `teams-devtools-extension.zip` from the built `dist/` folder.
