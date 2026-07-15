# Copilot Instructions

> Read `.github/AGENT_CONTEXT.md` for full details. This file is a shortcut.

1. This repo auto-syncs OpenWrt packages from upstream daily via GitHub Actions.
2. Sync sources are in `.tools/sync.d/*.yml` — add new ones by creating YAML files (and optional hook), not editing .tools/sync.py.
3. Files in `luci-app-*/` and `luci-theme-*/` are synced — modifications get overwritten, new files get deleted.
4. Safe: `.github/`, `.tools/`, `README.md`, `LICENSE`, `.gitignore`.
5. GLOBAL_PROTECTED: `.github .git .gitignore .tools README.md LICENSE`
