# Agent Context

Read this before operating the repo. It is the sole authoritative source.

## Repo

OpenWrt package feed. GitHub Actions runs `sync.py` daily (UTC 03:00) to sync packages from upstream repos.

## Structure

```
sync.py                     # sync engine (protected)
sync.d/*.yml                # per-target config (protected)
.github/                    # this file + workflows (protected)
luci-app-*/ luci-theme-*/   # synced content (DO NOT modify)
README.md LICENSE           # docs (protected)
```

## sync.d/*.yml fields

| field | required | desc |
|-------|----------|------|
| source_repo | yes | upstream `owner/repo` |
| source_path | yes | path in upstream, `""` = root |
| target | yes | local dir, end with `/` |
| exclude | no | top-level names to skip |
| branch | no | pin branch, empty = upstream default |
| protected | no | extra protected items merged with GLOBAL_PROTECTED |

New sync source = create `sync.d/foo.yml`, no code change needed.

## GLOBAL_PROTECTED

`.github .git .gitignore sync.py sync.log README.md LICENSE sync.d`

These top-level names never get deleted by sync.

## Sync rules (critical)

- Sync compares Git blob SHA. Same SHA = skip. Different = overwrite from upstream.
- Files in `luci-app-*/` / `luci-theme-*/` not in upstream → deleted on next sync.
- Modifying synced files → overwritten when upstream changes.
- Safe locations: `.github/`, `sync.d/`, `README.md`, `sync.py`, `sync.log`, `LICENSE`, `.gitignore`.
- To permanently protect a synced dir, add its top-level name to `protected` in the YAML.
