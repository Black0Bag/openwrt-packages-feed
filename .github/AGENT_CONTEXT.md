# Agent Context

Read this before operating the repo. It is the sole authoritative source.

## Repo

OpenWrt package feed. GitHub Actions runs `.tools/sync.py` daily (UTC 03:00) to sync packages from upstream repos.

## Structure

```
.tools/                     # sync infrastructure (protected)
  sync.py                   # sync engine
  sync.log                  # sync log
  sync.d/                   # per-target configs + hooks
    *.yml                   #   sync source config
    *.hook.sh               #   optional post-sync scripts
.github/                    # this file + workflows (protected)
luci-app-*/ luci-theme-*/   # synced content (DO NOT modify)
README.md LICENSE           # docs (protected)
```

## .tools/sync.d/*.yml fields

| field | required | desc |
|-------|----------|------|
| source_repo | yes | upstream `owner/repo` |
| source_path | yes | path in upstream, `""` = root |
| target | yes | local dir, end with `/` |
| exclude | no | top-level names to skip |
| branch | no | pin branch, empty = upstream default |
| protected | no | extra protected items (target-relative top-level) |
| extra_files | no | list of `{from: upstream_path, to: local_path}` to sync |
| hooks.post_sync | no | path to shell script executed after sync |
| description | no | description shown in sync log |

New sync source = create YAML + optional hook in `.tools/sync.d/`, no code change needed.

## GLOBAL_PROTECTED

`.github .git .gitignore .tools README.md LICENSE`

These top-level names never get deleted by sync.

## Sync rules (critical)

- Sync compares Git blob SHA. Same SHA = skip. Different = overwrite from upstream.
- Files in `luci-app-*/` / `luci-theme-*/` not in upstream → deleted on next sync.
- Modifying synced files → overwritten when upstream changes.
- Safe locations: `.github/`, `.tools/`, `README.md`, `LICENSE`, `.gitignore`.
- To permanently protect a dir inside a target, add its target-relative top-level name to `protected:` in the YAML. E.g. `protected: ["root"]` protects `target/root/...`.
- `extra_files` syncs additional files from upstream after the main tree sync.
- `hooks.post_sync` runs a shell script after sync (e.g. download binaries from releases).
