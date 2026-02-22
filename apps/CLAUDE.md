# Apps Directory

This directory is a personal PWA app launcher. The `index.html` is a full-screen progressive web app that acts as a home screen launcher for individual web apps, each living in its own subdirectory.

## Directory Structure

```
apps/
├── index.html          ← App launcher (the PWA home screen)
├── manifest.json       ← Launcher PWA manifest
├── sw.js               ← Launcher service worker (offline support)
├── icons/              ← Launcher home screen icons
│   ├── icon.svg
│   └── icon-maskable.svg
├── CLAUDE.md           ← This file
└── [app-name]/         ← One directory per app
    ├── index.html      ← App entry point (required)
    ├── manifest.json   ← App PWA manifest (required)
    └── sw.js           ← App service worker (recommended)
```

---

## Adding a New App

### Step 1 — Create the app directory

Create `apps/[app-name]/` where `app-name` is a short, lowercase, hyphenated slug that matches what will appear in the URL (e.g. `timer`, `habit-tracker`, `color-picker`).

### Step 2 — Create `apps/[app-name]/index.html`

Every app **must** use this boilerplate as its starting point. The key requirements are:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">

  <!-- REQUIRED: viewport-fit=cover fills the notch/Dynamic Island area -->
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">

  <!-- REQUIRED: iOS full-screen PWA -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <!-- black-translucent lets content flow under the status bar -->
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="App Name">

  <meta name="theme-color" content="#000000">
  <title>App Name</title>
  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="icons/icon.svg">

  <style>
    :root {
      /* REQUIRED: CSS variables for safe area insets */
      --safe-top: env(safe-area-inset-top, 0px);
      --safe-bottom: env(safe-area-inset-bottom, 0px);
      --safe-left: env(safe-area-inset-left, 0px);
      --safe-right: env(safe-area-inset-right, 0px);
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      width: 100%;
      height: 100%;
      background: #000;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    /* REQUIRED: Main container must respect safe areas */
    #app {
      min-height: 100vh;
      min-height: 100dvh;
      padding-top: calc(var(--safe-top) + 16px);
      padding-bottom: calc(var(--safe-bottom) + 16px);
      padding-left: calc(var(--safe-left) + 16px);
      padding-right: calc(var(--safe-right) + 16px);
    }
  </style>
</head>
<body>
  <div id="app">
    <!-- App content goes here -->
  </div>

  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      });
    }
  </script>
</body>
</html>
```

### Step 3 — Create `apps/[app-name]/manifest.json`

```json
{
  "name": "App Name",
  "short_name": "App Name",
  "description": "What this app does",
  "start_url": "/apps/app-name/",
  "scope": "/apps/app-name/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    {
      "src": "icons/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any"
    },
    {
      "src": "icons/icon-maskable.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "maskable"
    }
  ]
}
```

> **Note:** Use `display: "standalone"` — not `"fullscreen"`. iOS does not support `fullscreen` for PWAs; `standalone` hides the browser chrome while maintaining the status bar area (which content flows under thanks to `black-translucent`).

### Step 4 — Register the app in the launcher

Open `apps/index.html` and find the `APPS` array inside the `<script>` tag. Add an entry:

```javascript
const APPS = [
  {
    id: "app-name",           // slug — must match the subdirectory name
    name: "App Name",          // display label shown under the icon
    icon: "🎯",               // emoji shown on the icon tile
    color: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", // tile gradient
    path: "./app-name/",      // relative path to the app
    // iconImage: "./app-name/icons/icon.svg"  // optional: image instead of emoji
  },
  // ... existing apps
];
```

Order in the array controls order in the grid (left-to-right, top-to-bottom).

---

## PWA Requirements Checklist

Every app must satisfy all of these before being added to the launcher:

- [ ] `viewport-fit=cover` in the viewport meta tag
- [ ] `<meta name="apple-mobile-web-app-capable" content="yes">`
- [ ] `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- [ ] Safe area insets applied to all fixed/sticky elements and the main container
- [ ] `manifest.json` with `display: "standalone"` and correct `start_url`
- [ ] No horizontal overflow (breaks iOS standalone mode)
- [ ] Works without an internet connection (service worker recommended)

---

## Safe Area Insets — Key Concepts

On notch/Dynamic Island iPhones (X and later), the screen has areas that can be obscured by hardware. CSS `env()` provides the insets:

| Variable | Area protected |
|---|---|
| `env(safe-area-inset-top)` | Notch / Dynamic Island / status bar |
| `env(safe-area-inset-bottom)` | Home indicator bar |
| `env(safe-area-inset-left)` | Side (landscape) |
| `env(safe-area-inset-right)` | Side (landscape) |

**Rules:**
- The **background color** should extend edge-to-edge (set it on `html` or `body`, not on a padded container) so the notch area is filled with your app's color rather than white/black.
- **Interactive content** must be padded inside the safe zone.
- Use `calc()` to add your own padding on top of the safe area: `padding-top: calc(var(--safe-top) + 16px)`.

---

## Icon Gradient Palette

Use one of these for the `color` field in the APPS array, or invent your own:

| Name | CSS |
|---|---|
| Blue-purple | `linear-gradient(135deg, #667eea 0%, #764ba2 100%)` |
| Indigo-cyan | `linear-gradient(135deg, #0a84ff 0%, #5e5ce6 100%)` |
| Pink-red | `linear-gradient(135deg, #f093fb 0%, #f5576c 100%)` |
| Teal-blue | `linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)` |
| Green-teal | `linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)` |
| Orange-red | `linear-gradient(135deg, #fa709a 0%, #fee140 100%)` |
| Sunset | `linear-gradient(135deg, #f7971e 0%, #ffd200 100%)` |
| Midnight | `linear-gradient(135deg, #232526 0%, #414345 100%)` |

---

## iOS Installation

To add the launcher (or any individual app) to the iOS home screen:

1. Open the URL in **Safari** (Chrome/Firefox do not support PWA installation on iOS)
2. Tap the **Share** button (box with upward arrow)
3. Scroll down → tap **"Add to Home Screen"**
4. Confirm the name → tap **"Add"**

The app opens in full-screen standalone mode with content flowing into the notch area.

---

## Service Worker Template

Minimal service worker for a new app (`apps/[app-name]/sw.js`):

```javascript
const CACHE = 'app-name-v1';
const ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()))
);

self.addEventListener('activate', e =>
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()))
);

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
```

---

## Notes for Agents

- **Always update `apps/index.html`** (the `APPS` array) when a new app directory is added.
- The launcher is **the only entry point** users install to their home screen. Individual apps can also be installed separately via their own manifests.
- Do not modify `apps/sw.js` to cache individual app assets — each app's own service worker handles that.
- When bumping the launcher's service worker cache (e.g. after updating `index.html`), increment the version string: `app-launcher-v1` → `app-launcher-v2`.
- All paths in `manifest.json` and service workers are relative to the file location, not the domain root — double-check `start_url` and `scope`.
