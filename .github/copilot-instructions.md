# Copilot Instructions — openwrt-packages-feed

This repository is an ImmortalWrt/OpenWrt package feed that auto-syncs packages from upstream repos daily via GitHub Actions.

## CRITICAL: Read Before Operating

**Always read `.github/AGENT_CONTEXT.md` first.** It contains the full repository context, sync mechanics, and safety rules.

## Key Rules

1. **Do NOT modify files in synced directories** (`luci-app-*/`, `luci-theme-*/`). Changes will be overwritten or deleted by the next daily sync.
2. **Safe locations**: `.github/`, `README.md`, `sync.py`, `sync.log`, `LICENSE`, `.gitignore`
3. **To add a new sync source**: edit `SOURCES` in `sync.py`
4. **To protect a custom file from sync deletion**: add its top-level directory to `protected` in `sync.py`
5. **Sync runs daily at UTC 03:00** via GitHub Actions. Check `sync.log` for last run status.
6. **SHA-based incremental sync**: files are compared by Git blob SHA. Only changed files are downloaded.

## Repository Structure

| Directory | Type | Protected |
|-----------|------|-----------|
| `.github/` | Config (workflows, agent context) | ✅ Yes |
| `luci-app-cloud-clipboard/` | Synced from `Jonnyan404/cloud-clipboard-go` | ❌ No |
| `luci-app-passwall/` | Synced from `Openwrt-Passwall/openwrt-passwall` | ❌ No |
| `luci-theme-aurora/` | Synced from `eamonxg/luci-theme-aurora` | ❌ No |
| `luci-app-aurora-config/` | Synced from `eamonxg/luci-app-aurora-config` | ❌ No |
| `sync.py` | Sync script | ✅ Yes |
| `README.md` | Documentation | ✅ Yes |
| `LICENSE` | License | ✅ Yes |
