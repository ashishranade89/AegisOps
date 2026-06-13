# UI Issues Fix Plan — Vendor Outage Investigator
Date: 2026-06-12

## Context

This is the frontend of a React + Vite + TypeScript app (vendor_outage_investigator).  
Styling uses a **custom CSS variable system** in `frontend/src/index.css` with `[data-theme="dark"]` / light mode toggle.  
Tailwind is also installed (`@tailwindcss/vite`) but only used in `phase-bar.tsx` — the rest of the app uses CSS classes.

All work is in the `frontend/src/` directory.

---

## Task 1 — Fix `phase-bar.tsx`: broken light mode (CRITICAL)

**File:** `frontend/src/components/phase-bar.tsx`

**Problem:** Uses hardcoded Tailwind dark values that don't respond to the app's light/dark theme toggle:
- `bg-slate-900/40` → should use `var(--surface-2)` or `var(--bg)`
- `bg-slate-800` (connector lines) → should use `var(--line)`
- `text-slate-500` → should use `var(--ink-4)`
- `border-slate-800` → should use `var(--line)`
- `bg-orange-500/50` → should use `rgba` of `var(--primary-accent)` or a Tailwind opacity variant that matches the orange accent

**Fix:** Replace Tailwind hardcoded dark-mode color classes with inline CSS variables that respect the theme.  
The component can keep the `cn()` utility and Tailwind layout classes (`flex`, `items-center`, `gap-1`, etc.) — only the COLOR classes need switching to CSS variables.

Replace the `cn(...)` block for each phase step with `style={{}}` props using CSS variables:

```tsx
// BEFORE (broken in light mode):
className={cn(
  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 border',
  isActive && 'text-orange-400 bg-orange-500/10 border-orange-500/30 shadow-[0_0_12px_rgba(249,115,22,0.15)]',
  isPast && 'text-orange-400/60 bg-orange-500/5 border-orange-500/10',
  !isActive && !isPast && 'text-slate-500 bg-slate-900/40 border-slate-800',
)}

// AFTER (theme-aware):
className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 border"
style={{
  color: isActive ? 'var(--primary-accent)' : isPast ? 'rgba(249,115,22,0.6)' : 'var(--ink-4)',
  background: isActive ? 'rgba(249,115,22,0.10)' : isPast ? 'rgba(249,115,22,0.05)' : 'var(--surface-2)',
  borderColor: isActive ? 'rgba(249,115,22,0.30)' : isPast ? 'rgba(249,115,22,0.10)' : 'var(--line)',
  boxShadow: isActive ? '0 0 12px rgba(249,115,22,0.15)' : 'none',
}}
```

Also fix the connector line (the `w-5 h-px` div):
```tsx
// BEFORE:
className={cn('w-5 h-px', isPast ? 'bg-orange-500/50' : 'bg-slate-800')}

// AFTER:
className="w-5 h-px"
style={{ background: isPast ? 'rgba(249,115,22,0.5)' : 'var(--line)' }}
```

---

## Task 2 — Fix literal markdown asterisks in cockpit overlay (CRITICAL)

**File:** `frontend/src/pages/home.tsx`, line ~519

**Problem:** The JSX string contains `**"Try Now"**` which renders as literal asterisks — not bold text.

**Fix:** Replace the plain text paragraph with JSX that renders bold inline:

```tsx
// BEFORE:
<p className="muted" style={{ fontSize: '12.5px', margin: 0, maxWidth: '380px', lineHeight: 1.5 }}>
  Click anywhere on this panel or use the **"Try Now"** button to activate the autonomous incident simulation.
</p>

// AFTER:
<p className="muted" style={{ fontSize: '12.5px', margin: 0, maxWidth: '380px', lineHeight: 1.5 }}>
  Click anywhere on this panel or use the <strong>"Try Now"</strong> button to activate the autonomous incident simulation.
</p>
```

---

## Task 3 — Fix Escape key + focus trap on Walkthrough modal (HIGH)

**File:** `frontend/src/pages/home.tsx`, around line ~1020

**Problem:** The modal has no Escape key handler and no focus trap. Keyboard users cannot close it with Escape (WCAG 2.1 AA failure).

**Fix:** Add a `useEffect` that listens for `keydown` Escape and calls `setShowWalkthrough(false)`:

```tsx
// Add this useEffect inside HomePage(), alongside existing useEffects:
useEffect(() => {
  if (!showWalkthrough) return
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setShowWalkthrough(false)
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [showWalkthrough])
```

Also add `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` to the modal container div:

```tsx
// On the inner modal box (the white/surface div):
role="dialog"
aria-modal="true"
aria-labelledby="walkthrough-title"

// On the <h3> title:
id="walkthrough-title"
```

---

## Task 4 — Add `aria-label` to icon-only buttons (HIGH)

**File:** `frontend/src/App.tsx`

**Problem:** Icon-only buttons only have `title` attributes. Screen readers need `aria-label`.

**Fix:** Add `aria-label` to all three icon buttons:

```tsx
// Theme toggle button (~line 113):
<button
  className="icon-btn"
  onClick={toggleTheme}
  title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
  aria-label={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
>

// Panel toggle button (~line 121):
<button
  className="icon-btn"
  onClick={() => setChatOpen(!chatOpen)}
  title="Toggle activity timeline"
  aria-label="Toggle activity timeline"
>
```

**File:** `frontend/src/pages/run.tsx` (~line 157)

```tsx
// Close panel button:
<button
  className="icon-btn"
  onClick={() => setChatOpen(false)}
  title="Collapse Activity Panel"
  aria-label="Collapse Activity Panel"
>
```

---

## Task 5 — Remove orphaned CSS class `cockpit-unlock-overlay` (HIGH)

**File:** `frontend/src/pages/home.tsx`, line ~498

**Problem:** `className="cockpit-unlock-overlay"` references a class that has no CSS definition. Dead code.

**Fix:** Simply remove `cockpit-unlock-overlay` from the `className` attribute. The div already has all styles via inline `style={{}}` props, so the class name is entirely unused:

```tsx
// BEFORE:
className="cockpit-unlock-overlay"

// AFTER: remove the className prop entirely (the div already has full inline styles)
```

---

## Task 6 — Fix non-standard `font-weight` values (MEDIUM)

**Files:** `frontend/src/pages/home.tsx`, `frontend/src/pages/run.tsx`

**Problem:** `fontWeight: 550` and `fontWeight: 650` are non-standard values (CSS spec guarantees only 100–900 in multiples of 100).

**Fix:** Round to nearest valid value:
- `550` → `500` (medium)
- `650` → `600` (semi-bold)

Search for all occurrences and replace:
- In `home.tsx`: replace all `fontWeight: 650` → `fontWeight: 600` and `fontWeight: 550` → `fontWeight: 500`
- In `run.tsx`: replace `fontWeight: 650` → `fontWeight: 600`

---

## Task 7 — Fix `Loader2` + `.spinner` class conflict (MEDIUM)

**File:** `frontend/src/pages/run.tsx`, line ~102 and ~139

**Problem:** `<Loader2 className="spinner" ...>` applies a CSS border-based spinner class to an SVG icon. The border is invisible on SVG and the spin animation is redundant with Lucide's icon.

**Fix:** Replace `className="spinner"` with a direct CSS animation via `style`:

```tsx
// BEFORE (~line 102):
<Loader2 className="spinner" style={{ color: 'var(--primary-accent)', width: 11, height: 11 }} />

// AFTER:
<Loader2 style={{ color: 'var(--primary-accent)', width: 11, height: 11, animation: 'spin 0.8s linear infinite' }} />

// BEFORE (~line 139):
<Loader2 className="spinner" style={{ width: 28, height: 28, color: 'var(--primary-accent)', marginBottom: 16 }} />

// AFTER:
<Loader2 style={{ width: 28, height: 28, color: 'var(--primary-accent)', marginBottom: 16, animation: 'spin 0.8s linear infinite' }} />
```

---

## Task 8 — Fix `TraceItemRow` React key (MEDIUM)

**File:** `frontend/src/components/agent-feed.tsx`, line ~118

**Problem:** `key={i}` uses array index — causes React reconciliation issues when events stream in and collapsible rows lose their `open` state.

**Fix:** Build a stable composite key from event fields:

```tsx
// BEFORE:
return <TraceItemRow key={i} event={event} agentCost={cost} />

// AFTER:
return <TraceItemRow key={`${event.type}-${event.timestamp}-${i}`} event={event} agentCost={cost} />
```

---

## Task 9 — Standardize spin animation (MEDIUM)

**File:** `frontend/src/components/topology-graph.tsx`, line ~71

**Problem:** Uses `style={{ animation: 'spin 3s linear infinite' }}` directly. The `spin` keyframe is defined in `index.css` for `.spinner`, but accessed inconsistently.

**Fix:** Add a CSS utility class `.spin-slow` in `index.css` and use it:

**In `index.css`** (after the `.spinner` block around line 541):
```css
.spin-slow {
  animation: spin 3s linear infinite;
}
```

**In `topology-graph.tsx:71`:**
```tsx
// BEFORE:
<Cpu className="muted" size={16} style={{ animation: 'spin 3s linear infinite' }} />

// AFTER:
<Cpu className="muted spin-slow" size={16} />
```

---

## Task 10 — Add Firefox scrollbar support (MEDIUM)

**File:** `frontend/src/index.css`, after the `-webkit-scrollbar` block (~line 580)

**Problem:** Custom scrollbar only styled for WebKit (Chrome/Safari/Edge). Firefox uses default system scrollbars.

**Fix:** Add Firefox `scrollbar-width` and `scrollbar-color` properties to relevant containers:

```css
/* Add after the existing webkit scrollbar block (~line 580): */
.custom-scrollbar,
.scroll,
.chat-stream {
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
```

---

## Task 11 — Add `color-mix()` fallbacks (LOW)

**File:** `frontend/src/index.css`

**Problem:** `color-mix(in oklab, ...)` used for glow effects has no fallback for older browsers.

**Fix:** Add a `box-shadow: none` or static rgba fallback before each `color-mix` usage. There are 3 locations:
1. `.topbar-pill .dot` (~line 265) — add `box-shadow: 0 0 0 3px rgba(249,115,22,0.25);` before the `color-mix` line
2. `.chat-orb` (~line 397) — add `box-shadow: 0 0 0 3px rgba(249,115,22,0.25);` before the `color-mix` line  
3. `.trace-dot.active` (~line 449) — add `box-shadow: 0 0 0 3px rgba(249,115,22,0.25);` before the `color-mix` line

The `color-mix` version will override on supporting browsers since it comes after (or just leave both, the latter wins).

Actually, simpler: just replace `color-mix(in oklab, var(--primary-accent) 25%, transparent)` with `rgba(249, 115, 22, 0.25)` in all 3 places since `--primary-accent` is always `#f97316` (orange):

```css
/* Replace all 3 occurrences: */
/* color-mix(in oklab, var(--primary-accent) 25%, transparent) */
/* → */
rgba(249, 115, 22, 0.25)
```

---

## Task 12 — Improve topology graph mobile responsiveness (LOW)

**File:** `frontend/src/components/topology-graph.tsx`, line ~79–80

**Problem:** SVG fixed at `w-[1070px] h-[360px]` — not readable on small screens.

**Fix:** Use `viewBox` scaling so the SVG scales proportionally inside the scroll container. Change the className to use `min-w-[1070px]` instead of `w-[1070px]` and let the container handle overflow:

```tsx
// BEFORE:
<svg viewBox="0 0 1070 360" className="w-[1070px] h-[360px] block" style={{ overflow: 'visible' }}>

// AFTER:
<svg viewBox="0 0 1070 360" className="min-w-[1070px] w-full h-auto block" style={{ overflow: 'visible' }}>
```

This makes the SVG scale down proportionally when the viewport allows, but still scrolls horizontally when the container is smaller than 1070px.

---

## Task 13 — Fix button contrast: `color: '#000'` on orange (LOW)

**File:** `frontend/src/pages/home.tsx`, multiple occurrences

**Problem:** `color: '#000'` (black) on orange `var(--primary-accent)` background has contrast ratio ~3.5:1 — below WCAG AA 4.5:1 for normal text.

**Fix:** Change to `color: '#fff'` (white on orange = ~3.1:1) OR change to a dark navy `var(--ink)` which gives better contrast. Alternatively, increase the orange button's font-weight to 600 (bold text only needs 3:1 contrast ratio per WCAG AA).

Simplest fix: change all `color: '#000'` on primary buttons to use `fontWeight: 600` and keep `#000` (bold text drops WCAG threshold to 3:1, which orange passes).

Search for all: `color: '#000', borderColor: 'var(--primary-accent)'` and add `fontWeight: 600` if not already present.

---

## File Map (quick reference for Gemini)

```
frontend/src/
├── index.css                    → Tasks 9 (add .spin-slow), 10 (Firefox scrollbar), 11 (color-mix fallbacks)
├── App.tsx                      → Task 4 (aria-label on icon buttons)
├── pages/
│   ├── home.tsx                 → Tasks 2, 3, 5, 6, 13
│   └── run.tsx                  → Tasks 4, 6, 7
└── components/
    ├── phase-bar.tsx            → Task 1 (CRITICAL — light mode)
    ├── agent-feed.tsx           → Task 8 (React key)
    └── topology-graph.tsx       → Tasks 9, 12
```

---

## Priority Order for Gemini

1. **Task 1** — `phase-bar.tsx` light mode (Critical, high impact)
2. **Task 2** — `home.tsx` markdown asterisks (Critical, trivial fix)
3. **Task 3** — Modal Escape key (High, accessibility)
4. **Task 4** — `aria-label` on buttons (High, accessibility, multiple files)
5. **Task 5** — Remove orphaned class (High, trivial)
6. **Task 6** — `font-weight` 550/650 (Medium, search-replace)
7. **Task 7** — Loader2 spinner (Medium)
8. **Task 8** — React key in agent-feed (Medium)
9. **Task 9** — Standardize spin animation (Medium)
10. **Task 10** — Firefox scrollbar (Medium)
11. **Task 11** — `color-mix` fallbacks (Low)
12. **Task 12** — SVG responsive (Low)
13. **Task 13** — Button contrast (Low)
