# Landing Page Redesign

**Date:** 2026-06-13  
**Status:** Approved

## Problem

The home page (`/`) renders inside the same `Layout` as dashboard pages, giving it a 232px sidebar on the left. This makes the landing page look and feel like an app dashboard rather than a product landing page. No real website starts with a persistent left nav on its marketing page.

## Goal

Make `/` a proper full-width landing page — no sidebar, a minimal top nav instead — while leaving all other routes (`/run/*`, `/history`) exactly as they are.

## Design Decisions

- **Cockpit stays on the landing page.** "Try Now" / "Open Cockpit" scrolls down to the embedded cockpit panel. No separate route.
- **Top nav style: Logo + links + CTA.** "How It Works" (anchor scroll), "History" (route link), theme toggle, "Open Cockpit" primary button.
- **Route-level layout split** (not conditional branching inside one Layout). Two small, single-purpose layout components.

---

## Architecture

### Two layout components replace the single `Layout` in `App.tsx`

**`LandingLayout`** — used only for `/`:
- Renders `<LandingNav>` (56px sticky top bar)
- Full-width `<main className="landing-main">` — no sidebar grid
- Passes `children` (the `HomePage`) directly

**`AppLayout`** — used for `/run/*` and `/history`:
- Identical to the current `Layout` component (sidebar + topbar + children)
- No changes to sidebar logic, breadcrumbs, chat panel, theme toggle

### Route structure
```
/ → LandingLayout → HomePage
/run/:runId → AppLayout → RunPage
/history → AppLayout → HistoryPage
```

---

## Components

### `LandingNav` (new, inside `App.tsx`)

| Zone | Content |
|------|---------|
| Left | Brand mark (`V` square) + "Vendor Outage" / "Incident Investigator" — same markup as current sidebar brand |
| Center-right | `"How It Works"` button — smooth-scrolls to `#features` anchor · `<Link to="/history">` "History" |
| Right | Theme toggle icon button + `"Open Cockpit"` primary button — smooth-scrolls to cockpit `simulatorRef` (lifted via a shared scroll handler or passed via context) |

- Height: 56px
- `position: sticky; top: 0; z-index: 50`
- Background: `var(--surface)`, `border-bottom: 1px solid var(--line)`

### `home.tsx` — one change only

Add `id="features"` to the pipeline features `<section>` so the "How It Works" nav link has a scroll target. All other content (hero, cockpit, walkthrough modal, footer) stays exactly as-is.

---

## CSS additions (`index.css`)

Two new classes only. No existing classes modified.

```css
.landing-main {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.landing-nav {
  height: 56px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 20px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 50;
}
```

`LandingLayout` renders outside the `.app` grid entirely — no grid wrapper needed.

---

## What Does NOT Change

- `RunPage`, `HistoryPage` — untouched
- All sidebar logic, nav items, user card — untouched
- `HomePage` content (hero, 3D graph, features, cockpit, walkthrough modal, footer) — untouched except the `id="features"` addition
- Theme toggle behavior — moved to `LandingNav` on the home route, stays in `AppLayout` topbar on other routes
- Existing CSS classes — no modifications

---

## Scroll Coordination

`LandingNav`'s "Open Cockpit" button needs to trigger the same scroll-to-cockpit behavior currently inside `HomePage`. Two options:

1. **Simplest:** Keep the scroll button in the hero section only. The nav's "Open Cockpit" button calls `document.getElementById('cockpit')?.scrollIntoView(...)` — add `id="cockpit"` to the `simulatorRef` div in `home.tsx`.
2. **Alternative:** Pass a `scrollToCockpit` callback via React context.

Use option 1 — simpler, no new context needed.

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Add `LandingLayout`, `LandingNav`; rename current `Layout` → `AppLayout`; update routes |
| `frontend/src/pages/home.tsx` | Add `id="features"` to features section, `id="cockpit"` to cockpit section |
| `frontend/src/index.css` | Add `.landing-nav` and `.landing-main` classes |
