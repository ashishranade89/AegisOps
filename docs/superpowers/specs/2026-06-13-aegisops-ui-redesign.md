# AegisOps UI/UX Redesign — Design Spec

**Date:** 2026-06-13  
**Project:** AegisOps — Autonomous Vendor Outage Investigator  
**Approach:** Approach 2 — Cockpit Rebuild + Theme Unification  
**Stack:** React, Vite, TailwindCSS v4, Lucide React, CSS variables

---

## Goals

Three areas addressed in priority order:

1. **Agent Swarm Cockpit** — rebuild as Split-Brain layout with Midnight Ops style
2. **Overview Landing Page** — typography enforcement + hero polish
3. **Foundation Fixes** — theme unification and light mode contrast (byproduct of #1 and #2)

---

## 1. Agent Swarm Cockpit

### Layout: Split-Brain

The cockpit is extracted from `home.tsx` into a new component: `frontend/src/components/vigilant/AgentSwarmCockpit.tsx`.

Grid structure (full viewport height, no vertical scroll at 1440px):

```
┌─────────────────────────────────────────────────────┐
│  topnav (48px) — unchanged, shared across all views  │
├──────────────┬──────────────────────────────────────┤
│              │                                      │
│  Left Rail   │       Main Content Area              │
│  (220px)     │       (flex: 1)                      │
│              │                                      │
├──────────────┴──────────────────────────────────────┤
│  Bottom Strip (44px)                                 │
└─────────────────────────────────────────────────────┘
```

### Left Rail (220px, fixed)

Two sections separated by `margin-top: auto`:

**Investigation Steps** (top):
- 5 `StepItem` entries with connector lines between them
- Each step has: numbered circle indicator, title, subtitle
- States: `idle` (muted), `active` (blue highlight + blue border), `done` (green checkmark)
- Step 1: Select Scenario / Step 2: Launch Swarm / Step 3: Agent Analysis / Step 4: RCA Report / Step 5: Mitigation

**Vendor Health** (bottom, pushed by `margin-top: auto`):
- Section label: "Vendor Health"
- One `VendorRow` per vendor: name (sans-serif, medium weight) + status dot + status text
- Status values: `outage` (red), `degraded` (amber), `ok` (green)
- Always visible regardless of active step

### Main Content Area

Content depends on the active step:

**Steps 1–2 (pre-launch) — Split view:**
- Top half: Scenario Picker card
  - Header: "Select Incident Scenario"
  - Horizontal card grid: one card per scenario (name + vendor + severity tag)
  - Selected card: blue border + subtle blue tint background
  - Footer row: "Telemetry Mode" label + three mode pills (Standard / Preset / Upload JSON) + "Launch Swarm" primary CTA button
  - CTA: blue filled button, sans-serif mixed-case, Play icon
- Bottom half: Preview graph (`RootCauseGraph` with mock data)
  - Amber "Preview — Mock Topology" badge top-left
  - Graph always rendered; transitions to live state after launch

**Steps 3–4 (analysis running) — Full graph:**
- `RootCauseGraph` fills the entire main area (no padding, full bleed)
- SVG nodes: origin/error node has red glow filter + rotating dashed ring animation
- SVG link labels (latency values): `font-family: monospace` — these are raw stats
- On node hover: tooltip appears bottom-left
  - Tooltip fields (log data, latency ms, error rate): values in monospace
  - Tooltip field labels ("status:", "latency:", "errors:"): sans-serif
  - Agent annotation line: sans-serif italic
- **Swarm Overlay Panel** (floating, top-right corner):
  - Frosted glass: `background: rgba(6,8,16,.92)` + `backdrop-filter: blur(8px)`
  - Title: "AI Swarm Reasoning" (sans-serif uppercase label)
  - One `AgentRow` per agent: status icon, agent name, elapsed time
  - Agent states: `done` (green checkmark), `active` (amber spinner), `idle` (muted circle)
  - Elapsed time values: monospace tabular-nums
  - Divider then Confidence score: large green number (monospace tabular-nums) + "View breakdown" link

**Step 5 (mitigation):**
- Swarm overlay collapses
- Remediation code block appears bottom of main area: dark surface, monospace, copy button
- "Apply Mitigation" CTA becomes active in bottom strip

### Bottom Strip (44px)

Always visible. Content reflects current agent state:

- 4 `AgentBadge` pills: Triage Agent / Log Correlator / Root Cause Agent / Remediation Agent
  - `idle`: muted background, muted text
  - `done`: green tint background, green text, checkmark prefix
  - `active`: amber tint background, amber text, spinner icon
- Spacer (flex: 1)
- Confidence pill: green tint, confidence % in tabular-nums (visible once analysis starts, `—` before)
- "Apply Mitigation" button: disabled (muted) until `rootCause` data is available (confidence score populated, end of step 3), blue filled when active

### Color Tokens (Midnight Ops, dark mode)

| Token | Value | Usage |
|---|---|---|
| Page background | `#02040a` | `--bg` dark override |
| Surface | `#060810` | rail, overlay, strip |
| Surface 2 | `#0d1117` | cards, scenario picker |
| Border | `#0f172a` | all dividers |
| Border strong | `#1e293b` | active card borders |
| Ink primary | `#f1f5f9` | headings, active labels |
| Ink secondary | `#94a3b8` | body, descriptions |
| Ink muted | `#475569` | secondary labels |
| Ink disabled | `#334155` | idle states |
| Blue accent | `#1d4ed8` | primary CTA, active step |
| Blue light | `#60a5fa` | active step text |
| Green | `#10b981` / `#34d399` | done state, confidence |
| Amber | `#f59e0b` / `#fbbf24` | active state, warnings |
| Red | `#ef4444` / `#f87171` | error nodes, outage status |

---

## 2. Overview Landing Page

Changes to the existing landing view inside `home.tsx`.

### Navigation Header

No structural changes. Header is identical across all views: logo + brand text + 4 nav tabs (Overview / Agent Swarm / Investigations / Knowledge Base) + Live Gateway pill.

The active tab state changes per view — nothing else changes.

### Hero Section

- Status badge: keeps monospace — it's a system status indicator (`ACTIVE INCIDENT DETECTOR`)
- `<h1>`: sans-serif, `font-weight: 800`, `letter-spacing: -0.02em`. No monospace.
- Tagline `<p>`: sans-serif, `font-weight: 400`, relaxed line-height. No monospace.
- CTA buttons: sans-serif, mixed-case (not ALL-CAPS), `font-weight: 700`
  - Primary: "Run Demo Incident" with Play icon
  - Secondary: "Explore RCA Report →"

### Vendor Strip

- Section label: sans-serif (remove `font-mono`)
- Vendor names rendered as pill chips: sans-serif `font-weight: 600` (remove `font-mono`)
- Vendors: Stripe, AWS, Cloudflare, Twilio, Auth0, SendGrid, Datadog

### Agent Cards Section

- Section eyebrow: sans-serif uppercase label (remove `font-mono`)
- Card names: sans-serif `font-weight: 700`
- Card descriptions: sans-serif body copy
- Capability tags: sans-serif `font-weight: 600` (remove `font-mono`)

---

## 3. Foundation Fixes

### 3a. Theme Unification

**Problem:** `home.tsx` manages dark mode with local React state (`isDarkMode`) and hardcodes colors via inline Tailwind conditionals (e.g. `isDarkMode ? "bg-[#02040a]" : "bg-slate-50"`). `run.tsx` and its components use CSS variables from `index.css`. These systems don't share state — toggling theme in one view doesn't update the other's hardcoded values.

**Fix:**
1. Remove `isDarkMode` state and all `isDarkMode ? ... : ...` conditional class strings from `home.tsx`
2. Replace with CSS variable-aware Tailwind classes or inline `var()` references that respond to `data-theme`
3. Update `index.css` `[data-theme="dark"]` → change `--bg` from `#0B1726` to `#02040a` to match the intended dark base
4. The single theme toggle in `home.tsx` header continues to call `document.documentElement.setAttribute('data-theme', ...)` and `localStorage.setItem('theme', ...)` — this is already correct

### 3b. Monospace Enforcement

Remove `font-mono` / monospace font families from:
- Vendor strip names and label
- CTA button text
- Section eyebrows and descriptions
- Agent card capability tags
- Any nav label, heading, or body copy

Retain monospace for:
- System log lines (inline `<code>` and log stream panels)
- Run IDs (e.g. `run-abc123`)
- Remediation code blocks
- Raw numeric statistics (latency values on graph links, elapsed time in swarm overlay, confidence %)
- System status pills ("ACTIVE INCIDENT DETECTOR", "Live Gateway Linked")

### 3c. Light Mode Contrast

Once `home.tsx` uses CSS variables, light mode is automatically handled by the existing `[data-theme="light"]` values in `index.css`:
- `--bg: #F6F4EF` (warm off-white)
- `--line: #E6E2D8`, `--line-strong: #D7D2C3` (visible borders)
- `--ink: #0E2238` (high-contrast text)

No new light-mode CSS rules are needed.

---

## Component Boundaries

| File | Change |
|---|---|
| `frontend/src/index.css` | Update `--bg` dark to `#02040a`. No other structural changes. |
| `frontend/src/pages/home.tsx` | Remove `isDarkMode` state. Replace inline Tailwind conditionals with CSS variable classes. Extract Agent Swarm tab content into `AgentSwarmCockpit`. Fix monospace violations. |
| `frontend/src/components/vigilant/AgentSwarmCockpit.tsx` | New file. Split-Brain layout. Contains StepItem, VendorRow, AgentBadge, SwarmOverlay, ScenarioPicker sub-components. |
| `frontend/src/components/vigilant/RootCauseGraph.tsx` | Minor: add node hover tooltip (bottom-left), red glow + ring animation on error origin node, monospace on link latency labels. |
| `frontend/src/components/vigilant/VendorMonitor.tsx` | No changes. The left rail's `VendorRow` items are new simplified UI elements — they consume the same vendor health data prop shape but do not embed `VendorMonitor.tsx` directly. |

---

## Typography Rules (canonical reference)

| Context | Font |
|---|---|
| Headings, nav labels, descriptions, buttons | Sans-serif (`Geist`, `Inter`, system-ui) |
| System logs, log stream panels | Monospace (`JetBrains Mono`) |
| Run IDs, incident IDs | Monospace |
| Code blocks, remediation scripts | Monospace |
| Raw numeric stats (latency ms, error %, elapsed time) | Monospace tabular-nums |
| System status pills / badges | Monospace uppercase |
| Vendor names, CTA text, card descriptions | Sans-serif |

---

## Non-Goals

- No changes to `run.tsx` or its child components beyond what's needed for theme unification
- No changes to `App.tsx` routing structure
- No new routes or URL changes
- No backend changes
- No new external dependencies
