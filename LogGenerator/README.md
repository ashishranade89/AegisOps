# LogGenerator — Synthetic Incident Log Daemon

A background daemon that continuously writes realistic synthetic log entries to
`logs/incident.log`, drawing randomly from curated source files at configurable
intervals. Designed to feed the AegisOps **Log Sources** monitor during
development and demos without needing a live production system.

---

## Directory Structure

```
LogGenerator/
├── daemon.py               # Background daemon (this is what you run)
├── settings.cfg            # Interval and source-file configuration
├── Incidents-info.log      # 97 curated INFO-level source lines
├── Incidents-warnings.log  # 100 curated WARNING-level source lines
├── Incidents-Critical.log  # 120 curated CRITICAL/ERROR-level source lines
└── logs/
    └── incident.log        # Output file (auto-created on first run)
```

---

## Configuration — `settings.cfg`

The daemon reads all settings from `settings.cfg` at startup. Edit the file and
restart the daemon for changes to take effect.

```ini
[daemon]
# How often the internal scheduling loop ticks (seconds).
# Smaller = more precise interval timing; 5s is a safe default.
tick_interval = 5

[output]
# Path to the output log file, relative to the LogGenerator/ directory.
log_file = logs/incident.log

# Rotate the log once it reaches this size (bytes). 0 = no rotation.
max_bytes = 10485760   # 10 MB

# Number of rotated backup files to keep (incident.log.1, .2, …).
backup_count = 5

[info]
# Emit one randomly-chosen INFO line every interval_seconds.
interval_seconds = 30
source_file = Incidents-info.log

[warning]
interval_seconds = 300   # 5 minutes
source_file = Incidents-warnings.log

[critical]
interval_seconds = 600   # 10 minutes
source_file = Incidents-Critical.log
```

### Configuration Reference

| Section | Key | Default | Description |
|---|---|---|---|
| `[daemon]` | `tick_interval` | `5` | Internal loop cadence (s) |
| `[output]` | `log_file` | `logs/incident.log` | Output path (relative to `LogGenerator/`) |
| `[output]` | `max_bytes` | `10485760` | Rotate after N bytes (`0` = never) |
| `[output]` | `backup_count` | `5` | Rotated files to keep |
| `[info]` | `interval_seconds` | `30` | Seconds between INFO entries |
| `[info]` | `source_file` | `Incidents-info.log` | Pool to draw INFO lines from |
| `[warning]` | `interval_seconds` | `300` | Seconds between WARNING entries |
| `[warning]` | `source_file` | `Incidents-warnings.log` | Pool to draw WARNING lines from |
| `[critical]` | `interval_seconds` | `600` | Seconds between CRITICAL entries |
| `[critical]` | `source_file` | `Incidents-Critical.log` | Pool to draw CRITICAL lines from |

---

## Running the Daemon

```powershell
# From the LogGenerator/ directory
python daemon.py
```

The daemon prints every emitted line to **stdout** as well as writing to the
log file, so you can watch it live in the terminal.

```
2026-06-13T14:00:00Z [INFO] Registered info emitter  interval=30s  source=Incidents-info.log  (97 lines)
2026-06-13T14:00:00Z [INFO] Registered warning emitter  interval=300s  source=Incidents-warnings.log  (100 lines)
2026-06-13T14:00:00Z [INFO] Registered critical emitter  interval=600s  source=Incidents-Critical.log  (120 lines)
2026-06-13T14:00:00Z [INFO] Daemon running  PID=1234  output=logs/incident.log  Press Ctrl+C to stop.
2026-06-13T14:00:30Z [INFO] [nginx] 10.0.2.50 - - "POST /v1/billing/process HTTP/1.1" 200 312 "-" "Stripe/1.0"
2026-06-13T14:05:00Z [WARNING] [redis] memory usage is at 75.1% of maxmemory, eviction policy volatile-lru may trigger.
2026-06-13T14:10:00Z [CRITICAL] [Production] upstream timed out (110: Connection timed out) …
```

Press **Ctrl+C** to stop gracefully.

---

## Output Format

Each line written to `logs/incident.log` follows this format:

```
YYYY-MM-DDTHH:MM:SSZ [LEVEL] [source] message body
```

Example lines:

```
2026-06-13T14:00:30Z [INFO] [nodejs] [req: a1b2c] User authenticated successfully. UUID: u-8891a
2026-06-13T14:05:00Z [WARNING] [postgresql] duration: 1450.12 ms statement: SELECT count(*) FROM metrics
2026-06-13T14:10:00Z [CRITICAL] [Production] upstream timed out while reading response header from upstream
```

Timestamps are **UTC**. Log rotation produces `incident.log.1`, `incident.log.2`, … up to `backup_count`.

---

## How It Works

1. On startup the daemon reads `settings.cfg` and loads each source file into
   memory as a list of lines.
2. Three independent threads start — one per severity level. Each thread waits
   its configured `interval_seconds` before emitting the first line, then
   repeats on that interval.
3. Each emit picks a **random** line from the source pool, strips the original
   timestamp, and re-emits with the current UTC time and the appropriate log
   level. (The `Incidents-Critical.log` file contains HTML style-tag artefacts
   from its original source — the daemon strips these automatically.)
4. Output goes to both **stdout** and the rotating **log file**.
5. **Ctrl+C** (or `SIGTERM`) sets a stop-event; all threads finish their
   current sleep and exit cleanly within one tick interval.

---

## Connecting to AegisOps

Once the daemon is running, register the output file as a **Local File** log
source in AegisOps:

1. Open AegisOps → **Log Sources** (sidebar)
2. Click **Add Source**
3. Fill in:
   - **Name**: e.g. `LogGenerator (local demo)`
   - **Type**: `Local File`
   - **Log File Path**: absolute path to `LogGenerator/logs/incident.log`
   - **Scan Interval**: `30` seconds
   - **Auto-Remediate**: off (recommended for demos — lets you review the
     approval gate)
4. Click **Add Source**

AegisOps will now poll `incident.log` every 30 seconds. When it finds a
`CRITICAL` line (or ≥ 3 `WARNING` lines in one scan), it automatically opens
an incident investigation in the pipeline.

---

## Customising Source Lines

The three `Incidents-*.log` files are plain-text pools — one raw log line per
line. You can add, remove, or edit lines freely. The daemon reloads source
files only at startup, so restart it after making changes.

To add a new severity type or change the source pool for an existing level,
edit the corresponding `source_file` key in `settings.cfg`.
