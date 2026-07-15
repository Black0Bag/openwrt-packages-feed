# Copilot Instructions — openwrt-packages-feed

> **This file is a shortcut pointer.** The single authoritative source for repository context is **`.github/AGENT_CONTEXT.md`**. Always read it for full details.

## TL;DR

1. This repo auto-syncs OpenWrt packages from upstream daily (UTC 03:00) via GitHub Actions.
2. **Sync sources are externalized to `sync.d/*.yml`** — adding/modifying a sync source means creating/editing a YAML file, not editing `sync.py`.
3. Files in `luci-app-*/` and `luci-theme-*/` directories are **synced content** — modifications will be overwritten, new files will be deleted.
4. Safe custom locations: `.github/`, `sync.d/`, `README.md`, `sync.py`, `sync.log`, `LICENSE`, `.gitignore`.
5. `GLOBAL_PROTECTED` includes `.github` and `sync.d` — files there survive every sync.

## Sync Sources (in sync.d/)

| YAML File | Target |
|-----------|--------|
| `sync.d/luci-app-cloud-clipboard.yml` | `luci-app-cloud-clipboard/` |
| `sync.d/luci-app-passwall.yml` | `luci-app-passwall/` |
| `sync.d/luci-theme-aurora.yml` | `luci-theme-aurora/` |
| `sync.d/luci-app-aurora-config.yml` | `luci-app-aurora-config/` |

To add a new sync source → create a new YAML file under `sync.d/`.

## Before Making Changes

1. **Read `.github/AGENT_CONTEXT.md` first** — it has the complete operating guide.
2. Check recent sync status in `sync.log` or Actions.
3. Confirm your change does not touch synced directories.

## Repository Structure (abbreviated)

```
├── sync.py                          # Sync engine (protected)
├── sync.d/*.yml                     # Per-target config (protected)
├── .github/AGENT_CONTEXT.md         # Full agent handbook (protected)
├── .github/copilot-instructions.md  # ← this file (protected)
├── luci-app-*/  luci-theme-*/       # Synced from upstream (NOT modifiable)
├── README.md, LICENSE               # Docs (protected)
```
