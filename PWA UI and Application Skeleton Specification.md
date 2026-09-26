# Application UI & Core Skeleton Specification

## Objective

Build the initial skeleton of a modular iPhone Web App/PWA.

At this stage, do **not** implement any specific application modules or business functionality. The purpose of this iteration is to establish:

- The project architecture.
- Application startup.
- Loading screen.
- Main menu.
- Horizontal swipe navigation.
- Modular menu registration.
- Shared UI architecture.
- Persistent application infrastructure.
- PWA installation/offline foundations.

The architecture must make adding future modules straightforward.

---

# 1. Technology Philosophy

Build the application as a modern Progressive Web App intended primarily for iPhone and iOS WebKit.

The application should feel like a native iOS application rather than a conventional website.

Use standard web technologies and keep dependencies minimal.

Prefer:

- TypeScript.
- Modern CSS.
- Standard Web APIs.
- PWA capabilities.
- A lightweight UI framework only if it provides a concrete architectural benefit.

Do not introduce large dependencies without justification.

The application should remain lightweight and fast to load.

---

# 2. Project Architecture

Use a modular architecture similar to:

```text
project/
│
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── ...
│
├── public/
│   ├── icons/
│   ├── assets/
│   └── manifest.json
│
└── src/
    │
    ├── main.ts
    │
    ├── core/
    │   ├── app.ts
    │   ├── navigation.ts
    │   ├── moduleRegistry.ts
    │   ├── storage.ts
    │   └── ...
    │
    ├── modules/
    │   └── [future modules]
    │
    ├── shared/
    │   ├── components/
    │   ├── styles/
    │   └── utilities/
    │
    └── frames/
        ├── LoadingFrame/
        └── HomeFrame/
```

The exact implementation may differ if there is a technically superior arrangement, but preserve the architectural principles.

`main.ts` must remain the application's entry point.

It should primarily initialize the application and call the main application function.

Avoid placing application logic directly in `main.ts`.

Conceptually:

```text
main.ts
   ↓
initialize application
   ↓
App
   ↓
Loading Frame
   ↓
Home Frame
   ↓
Module selected
   ↓
Module Frame
```

---

# 3. Module Architecture

The application is intentionally designed as a multi-purpose container.

Future functionality must be implemented as independent modules.

Do not hard-code individual modules into the navigation system.

Create a module registry that can contain module definitions.

A module definition should contain whatever metadata is necessary to display and launch it, such as:

```text
id
title
icon
entry point
optional metadata
```

For example:

```text
modules/
├── safety/
├── notes/
├── utilities/
└── ...
```

A new module should ideally require:

1. Creating its module directory.
2. Implementing its module entry point.
3. Implementing its frames/views.
4. Registering the module.

The core navigation system should not need to be rewritten.

At this stage, create only the module infrastructure and a small number of placeholder modules for testing the navigation UI.

The placeholder modules should not contain actual functionality.

---

# 4. Loading Screen

The application must initially display a loading frame.

The loading screen should:

- Display application branding/logo assets.
- Provide a visually polished startup experience.
- Initialize application infrastructure.
- Initialize the module registry.
- Initialize storage.
- Initialize the PWA/service-worker infrastructure where appropriate.
- Transition to the Home Frame after initialization.

Avoid artificial loading delays.

If initialization completes immediately, transition immediately.

The loading screen should use a smooth transition into the Home Frame.

---

# 5. Home Menu

The Home Frame is the central navigation interface.

The primary navigation method is horizontal swiping.

The user should be able to swipe left and right between available modules.

Each completed swipe moves the selection by exactly one module.

Do not allow a single swipe to skip multiple modules.

The currently selected module is the visual focus.

Adjacent modules should remain partially visible at the left and right edges of the screen.

Conceptually:

```text
┌─────────────────────────────────────┐
│                                     │
│      [previous]  [ SELECTED ]  [next│
│                   MODULE            │
│                                     │
│                Module Name          │
│                                     │
└─────────────────────────────────────┘
```

The adjacent modules should appear partially off-screen rather than being displayed as a conventional grid or list.

The selected module should occupy substantially more visual attention than adjacent modules.

Use smooth horizontal animation and snapping.

The navigation should feel similar to swiping between native iOS interfaces.

---

# 6. Swipe Behavior

Implement touch/pointer-based horizontal navigation.

Requirements:

- Horizontal swipe gestures must be recognized naturally.
- Vertical scrolling should not accidentally trigger module navigation.
- A completed swipe advances exactly one module.
- The interface should snap cleanly to the selected module.
- Repeated rapid swipes should be handled gracefully.
- Animation should remain smooth at 60 FPS where possible.
- Prevent accidental selection changes from tiny movements.
- Use a sensible swipe threshold.
- Support touchscreens as the primary input.
- Mouse/pointer interaction may be supported for development convenience.

The selected module should always have a deterministic index.

Do not rely solely on visual position to determine application state.

---

# 7. Menu Title

The title of the currently selected module must appear below the selected module.

The title should update whenever the selected module changes.

The title should be visually integrated with the overall design rather than appearing as a generic HTML heading.

The title transition should be smooth.

---

# 8. Visual Design

The visual language should strictly follow Apple's contemporary iOS design direction.

The intended aesthetic is the modern translucent "Liquid Glass"/bubble/aqua visual language.

Use:

- Translucent surfaces.
- Layered depth.
- Large rounded corners.
- Soft blur.
- Subtle highlights.
- Glass-like materials.
- Fluid animations.
- Gentle shadows.
- Refraction-like visual effects where practical.
- Generous spacing.
- Clean typography.
- Restrained visual complexity.

Avoid:

- Generic Bootstrap-like UI.
- Material Design styling.
- Desktop web dashboard aesthetics.
- Excessive borders.
- Flat rectangular panels.
- Dense information layouts.
- Unnecessary gradients.
- Excessive shadows.
- Visually noisy backgrounds.

The design should feel deliberately designed for an iPhone display.

Do not merely copy an Apple application. Use Apple's design language as the visual reference while maintaining original application branding.

---

# 9. Responsive Layout

The primary target is an iPhone in portrait orientation.

Design around varying iPhone screen sizes.

The interface must:

- Respect safe-area insets.
- Work around the Dynamic Island/notch.
- Work on devices without a Dynamic Island.
- Adapt to different viewport heights.
- Adapt to different viewport widths.
- Remain usable with larger accessibility text where practical.

Use modern viewport units and safe-area CSS variables where appropriate.

Do not assume a fixed 375×812 or similar screen size.

---

# 10. Animation

Animation is an important part of the application's visual identity.

Transitions should be:

- Smooth.
- Short.
- Physically intuitive.
- Interruptible where practical.
- Consistent throughout the application.

Use transform/opacity-based animation where possible to maintain performance.

Avoid expensive layout-triggering animations.

The selected module should visually move into focus rather than simply disappearing and being replaced.

---

# 11. Storage Infrastructure

Implement a storage abstraction from the beginning even though the initial skeleton requires very little persistent data.

The rest of the application must not directly depend on a specific storage implementation.

For example:

```text
UI / Module
     ↓
Storage API
     ↓
Storage implementation
```

Storage should prioritize:

1. Low overhead.
2. Fast access.
3. Minimal redundancy.
4. Persistence.
5. Compact representation.

Human-readable storage is not a requirement.

Do not store unnecessary duplicated state.

Include a schema/version mechanism so future modules can safely evolve persisted data.

Do not make the application dependent on local storage for basic startup.

---

# 12. PWA Infrastructure

Configure the application as a proper PWA.

Provide:

- Web App Manifest.
- Appropriate application icons.
- Standalone display mode.
- Theme/background configuration.
- Service worker.
- Application resource caching.
- Offline loading of the core application.

The application should remain usable when temporarily offline for functionality that does not inherently require network access.

The PWA should launch without displaying normal browser navigation UI when installed to the Home Screen.

---

# 13. Application State

Keep global application state minimal.

At minimum, distinguish:

```text
Application State
├── initialization state
├── current frame
├── selected module
└── persistent configuration
```

Do not create a global state-management system merely for the sake of having one.

Introduce additional state infrastructure only when the application actually requires it.

---

# 14. Error Handling

The application should fail gracefully.

Avoid displaying raw JavaScript errors to the user.

Provide an application-level error boundary or equivalent mechanism appropriate to the chosen architecture.

Development builds should provide useful diagnostic information.

Production builds should present a clean recovery interface.

The application should never become permanently stuck on the loading screen because a non-critical initialization task failed.

---

# 15. Performance

Performance is a priority.

The application should:

- Minimize JavaScript bundle size.
- Minimize dependencies.
- Avoid unnecessary re-rendering.
- Lazy-load future modules where appropriate.
- Avoid loading unused module resources at startup.
- Keep startup work minimal.
- Prefer GPU-friendly animation.
- Avoid unnecessary network requests.

The Home Frame should appear as quickly as practical.

Future modules should ideally be loaded only when necessary.

---

# 16. Development Standards

Keep the code modular and readable.

Prefer small, focused files over large files containing unrelated functionality.

Use clear names.

Avoid circular dependencies.

UI components should not contain unrelated business logic.

Core infrastructure should not depend on individual modules.

Modules may depend on core/shared infrastructure, but the core must remain independent of specific future module implementations.

Do not prematurely optimize architecture beyond what is needed to maintain these boundaries.

---

# 17. Initial Deliverable

For this phase, implement only:

1. Application entry point.
2. Application initialization.
3. Loading screen.
4. Home menu.
5. Horizontal swipe navigation.
6. Selected-module state.
7. Module registry.
8. Placeholder modules for testing.
9. Module title display.
10. Apple-inspired visual system.
11. Responsive iPhone layout.
12. Basic PWA configuration.
13. Basic service worker/offline infrastructure.
14. Storage abstraction.
15. Error handling.
16. Clean modular project structure.

Do NOT implement any actual utility/safety/productivity modules yet.

The application should nevertheless be architecturally ready for them.

---

# 18. Definition of Done

The initial implementation is complete when:

- The application launches successfully.
- A loading screen appears first.
- The application transitions into the Home Frame.
- Multiple placeholder modules can be registered through the module registry.
- The Home Frame displays one selected module prominently.
- Portions of neighboring modules are visible at the edges.
- Swiping left/right moves exactly one module.
- The selected module snaps into position.
- The selected module's title appears below it.
- Adding another placeholder module requires no changes to the navigation implementation.
- The application can be installed as a Home Screen PWA.
- The application launches in standalone mode.
- Core resources remain available offline.
- The UI is responsive across common iPhone screen sizes.
- The visual language consistently follows the specified translucent Apple-inspired aesthetic.
- No actual feature modules have been implemented yet.

Before adding additional functionality, preserve this architecture and extend it through the established module system.