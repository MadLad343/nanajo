# Claude Code Project Specification: Lightweight Offline-First iPhone Web App

Use this document as the project-level implementation brief. Build a modular Progressive Web App (PWA) intended to be added to an iPhone Home Screen and run in standalone mode through WebKit. Keep the implementation small, understandable, and easy to extend. Treat this as a web app; do not introduce a native wrapper or Electron-style runtime.

## Goals

- Work as an installable, standalone-feeling iPhone web app.
- Load the application shell and core experience without a network connection after the first successful load.
- Keep UI, application logic, and persistence separate.
- Store local data compactly and efficiently. Human-readable on-disk data is not a requirement.
- Keep dependencies and abstractions proportional to the app's actual needs.

## Required project structure

Use this structure as the default. Add files only when needed, and keep the hierarchy intact:

```text
project/
├── index.html                 # Minimal document shell; loads the entry module
├── manifest.webmanifest       # PWA name, icons, display and launch settings
├── sw.js                      # Service worker: app shell and static asset caching
├── src/
│   ├── main.js                # Main function; app composition and startup
│   └── app/
│       ├── <feature>.js       # Major features/application modules
│       ├── storage.js         # The only module that owns persistence details
│       ├── state.js           # Small shared state/event boundary, if needed
│       └── frames/            # UI views/screens, nested under app modules
│           ├── <frame>.js
│           └── ...
├── assets/
│   ├── icons/
│   └── ...
└── styles/
    └── app.css
```

`index.html` must load `src/main.js` as an ES module. `main.js` defines and calls one `main()` startup function. It should initialize storage, register the service worker when supported, create the app shell, and connect major modules. Avoid putting feature behavior in `index.html`.

Major modules live directly in `src/app/`. Put each screen or substantial view in `src/app/frames/`; a frame owns rendering and user interaction for that view. Frames must call feature modules through clear functions and must not access IndexedDB or service-worker caches directly.

## Module boundaries

- **Frames/UI:** Render and update the visible interface; collect user input; call feature functions. Keep DOM details here.
- **Feature modules:** Implement app behavior and coordinate state changes. Do not depend on specific DOM nodes.
- **Storage module:** Own database opening, reads/writes, schema versioning, migrations, and serialization. Expose small application-oriented functions, not raw database handles.
- **Startup module (`main.js`):** Wire modules together. Keep it orchestration-only.
- **Service worker:** Cache the application shell and versioned static assets. It must not become a second application logic or user-data layer.

Use ES modules and explicit imports. Avoid circular dependencies and global mutable state. Pass dependencies or callbacks where that keeps module ownership clear; do not build a general-purpose dependency injection framework.

## Storage and serialization

Use IndexedDB as the default persistent store for structured app data. It is asynchronous, supports transactions and indexes, and is better suited than `localStorage` for an app that may grow. Use `localStorage` only for tiny, noncritical preferences if a clear need exists; do not use it for primary records. Do not add OPFS or a database wrapper library unless a concrete app requirement justifies it.

Keep storage compact without making application code brittle:

- Store only data that must survive app restarts. Derive display values rather than duplicating them.
- Use compact field names only inside the persistence encoding boundary if profiling shows a meaningful size benefit. Keep domain objects and module APIs descriptive.
- Prefer native structured-clone values in IndexedDB. Store binary data as `Blob`/`ArrayBuffer` when appropriate instead of base64 strings.
- Avoid JSON stringify/parse for routine IndexedDB storage; IndexedDB already stores structured-cloneable objects. If data must be exported or encoded, isolate the codec behind `storage.js` and version its format.
- Avoid premature compression, custom binary formats, and hand-built file systems. Add them only when measured storage or transfer needs warrant the complexity.
- Use stable record IDs and timestamps only where they serve actual lookup, ordering, sync, or conflict needs.

Centralize schema versioning in `storage.js`. Every schema change must increment the IndexedDB version and include an upgrade path that preserves existing user data. Keep migrations deterministic and safe to run as part of database upgrade. Never silently clear the database on an upgrade or error.

Handle storage errors visibly and preserve user data. Do not assume storage is unlimited or guaranteed to be available. Request persistent storage with `navigator.storage.persist()` only if the app's data is valuable enough to justify it; continue to work if the request is denied. Provide an export/backup path if user-created data becomes important or difficult to recreate.

## Offline-first behavior

- Make the service worker cache the minimal application shell (HTML, CSS, JS, manifest, icons) so the app can reopen offline after its first online visit.
- Use a versioned cache name. On activation, remove only obsolete caches owned by this app.
- Serve the application shell cache-first. For navigations, fall back to the cached shell when offline. Keep user data in IndexedDB, not Cache Storage.
- Ensure an update does not leave the app in a mixed-version state. Activate new static assets coherently and let the user reload or apply the update at a safe point if needed.
- Show a useful offline state when an operation genuinely requires connectivity. Do not show network failure for local operations.
- Do not promise background sync, push notifications, or browser capabilities without checking iOS/WebKit support and defining a graceful fallback.

## iPhone and PWA behavior

- Include a valid web app manifest with a standalone display mode, app name, theme colors, and supplied icons.
- Add the relevant iOS Home Screen metadata and touch icon in the HTML shell where needed.
- Use responsive layouts, safe-area insets, and touch-friendly controls. Avoid relying on hover or precise pointer input.
- Feature-detect optional browser APIs and keep core use functional when they are missing.
- Do not treat the Home Screen web app as having unrestricted access to an ordinary native filesystem. User files should use browser-supported APIs and explicit user selection/export flows.

## Maintainability constraints

- Prefer browser APIs and platform features before adding dependencies. Each dependency must solve a concrete need; explain the need in the change summary.
- Keep modules small and cohesive. Split a module when it has multiple independent responsibilities, not just to minimize line count.
- Avoid speculative plugin systems, generic repositories, elaborate state frameworks, and unnecessary build tooling.
- Keep configuration and app-specific constants in one obvious place when they are shared.
- Do not add comments that restate code. Comment only non-obvious decisions or constraints.
- Preserve a straightforward development path with a local static server and ES modules. Add a build step only when required by a specific feature or deployment target.

## Implementation workflow for Claude Code

1. Inspect the existing repository and follow its established conventions where they do not conflict with this specification.
2. Before adding dependencies or infrastructure, explain why the project needs them.
3. Implement the smallest coherent version of the requested feature within the module boundaries above.
4. When changing persistence, define the schema impact and migration path before changing stored records.
5. Summarize files changed, user-visible behavior, storage/schema impact, and any iOS/WebKit limitations.
6. Run checks that are already configured in the repository when the user asks for verification; do not introduce a large testing or build stack just for this specification.

## Decisions to make per app

Before implementation, identify the app's actual screens, records, and whether any capability needs a server. Keep the initial schema and modules limited to those needs. If synchronization, accounts, sensitive data, large media, or collaboration is requested later, revisit the storage and security design explicitly rather than quietly adding complexity.
