# Changelog

This changelog is generated from the current git history. Run `scripts/update-changelog.ps1` after commits change, or set `.githooks` as your `core.hooksPath` to refresh it automatically on commit and merge.

## 2026-06-13
- `01b7ee7` chore: initial commit — pre-redesign baseline
- `0005bd5` style: update dark mode base bg to #02040a
- `844cd26` feat: add AgentSwarmCockpit with Split-Brain layout
- `7777d03` fix: resolve quality issues in AgentSwarmCockpit — move constants to module scope, fix agent name map, remove unused props, move keyframe to CSS
- `252ff7e` fix: spec compliance gaps in AgentSwarmCockpit (card bg, live graph, confidence pill)
- `5de2aad` fix: deriveActiveStep completed/failed, aria-pressed on toggles, Launch aria-disabled
- `d7326ad` refactor: remove isDarkMode from RootCauseGraph, use CSS vars; add error origin ring animation
- `61ac204` fix: replace hard-coded slate classes with CSS variables in RootCauseGraph tooltip
- `94f0143` fix: SVG coords, status safety, keyboard access in RootCauseGraph
- `77c7ad2` feat: replace home.tsx sandbox tab with AgentSwarmCockpit
- `cfe82d2` chore: remove unused state and handlers after AgentSwarmCockpit wiring
- `1ce999f` chore: suppress remaining unused setter warnings in home.tsx
- `13e9a1b` refactor: unify home.tsx theming to CSS variables, remove inline isDarkMode conditionals
- `076ced9` style: remove font-mono from UI labels, replace remaining slate text colors with CSS vars
- `474845d` fix: replace broken var(--slate-*) inline styles with CSS variable tokens
- `140da9b` Initial commit
- `3bc7c55` feat: add full project source — backend agents, API, frontend, tests, config
- `ac13e12` Merge branch 'main' of github.com:ashishranade89/AegisOps
- `84dbfdb` Readme file updated
- `63d3233` Updated readme file
- `21f02fc` Added interative html
- `011b161` Fixed UI issues
- `782b124` Merged
- `0086aae` Added docs
- `926f710` Fixed some flow issues
- `42f4e84` Fix resume_incident to pass credentials from payload instead of empty dict
- `b279148` Add chromadb to dependencies for vector search
- `0548684` Fix: Correct localStorage key for OpenRouter API key in chatAboutIncident
- `1d3747c` Remove hardcoded fake metadata from history run panel
- `e6e8c22` Remove duplicate vite.config.js (vite.config.ts takes precedence)
- `d90bc55` Add custom_telemetry validation in start_incident endpoint
- `7b4a4d0` Migrate Chroma import from langchain-community to langchain-chroma
- `ede4c17` Fix cockpit locked after completed/failed run — restore launch button
- `ed65288` Fixed UI issues and start flow related issues
- `a37aa55` Two ways to resolve going forward:   1. (Recommended for dev) Enter your OpenRouter key in the UI's API key gate — it's stored in localStorage as openrouter_key and will   now be forwarded on resume.   2. (Simpler for local use)
- `e591cd3` add support for environment file
- `6e7a2ca` Fix 401/400 errors and Windows startup issues
- `b6ca2fb` commit
- `5ad9df1` INCIDENT_API_KEY removed
- `e725f14` start.ps1

## 2026-06-14
- `ecca0fc` Add Slack Bot + Jira integration design spec
- `cc9fd7f` Add Slack + Jira integration implementation plan
- `fa20ea3` feat: add Jira + Slack Bot config properties to AppConfig
- `3cc977f` feat: add jira_ticket_url, jira_ticket_id, slack_approval_ts to IncidentState
- `9fae441` feat: add jira_tool with create/update/comment + dry-run support
- `336a938` feat: add slack_bot_tool with Block Kit approval, update, and threaded report
- `a1aa08b` feat: add jira_agent graph node — creates Jira ticket after triage
- `aa1565b` feat: add slack_agent — slack_report_node and send_slack_approval helper
- `0a0f048` feat: wire jira and slack_report nodes into LangGraph pipeline
- `63b0af7` feat: wire Slack approval at pause, add /api/slack/action endpoint, update Jira+Slack on resume
- `172bd5d` fix: add Jira rejection comment in slack_action endpoint
- `15c285f` docs: add Jira + Slack Bot env vars to .env.example
- `87df7dc` test: add /api/slack/action endpoint tests
- `0b1b34a` start.ps code changes INCIDENT_API_KEY  key removal
- `7c774ed` Merge origin/jira-integration — debug logging + secrets fixes
- `f156e06` Deployement changes
- `4c2be39` code fixes
- `ea92506` Merge origin/slack_integration — remove INCIDENT_API_KEY auth, update start.ps1
- `bddd066` ui fixes
- `8c1bb66` Merge origin/main (ui fixes, code fixes) — resolve start.ps1/vite.config conflicts
