# Agent Context — openwrt-packages-feed

> **任何 AI Agent 在操作本仓库前，务必先完整阅读本文件。**
> 本文件是仓库唯一的**权威信息源**，覆盖仓库结构、同步机制、安全规则、操作指南。
> 其他 Agent 上下文文件（copilot-instructions.md / cursor-rules.mdc）是指向本文件的快捷入口。

---

## 1. 仓库概述

本仓库是一个 **ImmortalWrt/OpenWrt 补充软件源**，通过 GitHub Actions 每日自动从上游仓库同步 LuCI 应用包和主题。

- **仓库地址**：https://github.com/Black0Bag/openwrt-packages-feed
- **默认分支**：`master`
- **同步脚本**：`sync.py`（由 GitHub Actions 每日 UTC 03:00 自动执行）
- **同步日志**：`sync.log`（每次运行覆盖写入，作为 Artifact 保留 7 天）

---

## 2. 仓库结构

```
openwrt-packages-feed/
├── README.md                           # 仓库说明（受保护）
├── LICENSE                             # 许可证（受保护）
├── sync.py                             # 自动同步脚本（受保护）
├── sync.log                            # 最近一次同步日志（受保护）
├── sync.d/                             # ⚙️ 同步源配置目录（受保护）
│   ├── luci-app-cloud-clipboard.yml    # 云剪贴板同步规则
│   ├── luci-app-passwall.yml           # PassWall 同步规则
│   ├── luci-theme-aurora.yml           # Aurora 主题同步规则
│   └── luci-app-aurora-config.yml      # Aurora 配置同步规则
├── .github/                            # GitHub 配置目录（整体受保护）
│   ├── AGENT_CONTEXT.md                # ← 你正在阅读的文件（权威信息源）
│   ├── copilot-instructions.md         # GitHub Copilot 自动读取的指针
│   ├── cursor-rules.mdc                # Cursor / Windsurf rules
│   └── workflows/autosync.yml          # GitHub Actions workflow
├── luci-app-cloud-clipboard/           # 云剪贴板 LuCI 界面（上游同步）
├── luci-app-passwall/                  # PassWall 代理管理界面（上游同步）
├── luci-theme-aurora/                  # Aurora 主题（上游同步）
└── luci-app-aurora-config/             # Aurora 主题配置应用（上游同步）
```

---

## 3. 同步源配置（sync.d/）

每个同步源在 `sync.d/` 目录下有独立的 YAML 配置文件，可自由添加和自定义。**新增/修改同步源无需改 `sync.py`**。

| 配置文件 | 目标目录 | 上游仓库 | 上游路径 | 默认分支 | exclude |
|---------|---------|---------|---------|---------|---------|
| `sync.d/luci-app-cloud-clipboard.yml` | `luci-app-cloud-clipboard/` | `Jonnyan404/cloud-clipboard-go` | `openwrt/luci-app-cloud-clipboard` | `main` | 无 |
| `sync.d/luci-app-passwall.yml` | `luci-app-passwall/` | `Openwrt-Passwall/openwrt-passwall` | `luci-app-passwall` | `main` | 无 |
| `sync.d/luci-theme-aurora.yml` | `luci-theme-aurora/` | `eamonxg/luci-theme-aurora` | `(根目录)` | `master` | `.claude` `.dev` `.vscode` `.github` `.gitignore` `CLAUDE.md` `README.md` `README_zh.md` |
| `sync.d/luci-app-aurora-config.yml` | `luci-app-aurora-config/` | `eamonxg/luci-app-aurora-config` | `(根目录)` | `master` | `.github` `.gitignore` `README.md` `README_zh.md` `docs` `tests` `package.json` |

### YAML 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `source_repo` | ✅ | 上游仓库（`作者/仓库名`） |
| `source_path` | ✅ | 上游仓库中的路径，空字符串 `""` 表示根目录 |
| `target` | ✅ | 本仓库中的目标目录（以 `/` 结尾表示目录） |
| `exclude` | ❌ | 排除的文件/目录列表（按顶层名匹配） |
| `description` | ❌ | 描述信息，仅用于日志，可读可省略 |
| `branch` | ❌ | 指定分支；空字符串/省略则自动获取上游默认分支 |
| `protected` | ❌ | 该源自定义的 protected 项，会与全局列表合并 |

### 示例：添加新同步源

在 `sync.d/` 下创建 `sync.d/luci-app-example.yml`：

```yaml
# 同步规则描述
source_repo: "上游作者/仓库名"
source_path: ""                    # 空字符串表示根目录
target: "luci-app-example/"
exclude:
  - "README.md"
  - ".github"
description: "示例 LuCI 应用"
branch: ""
protected: []                     # 留空表示不增加额外保护
```

提交推送后，下次 GitHub Actions 自动运行（也可手动触发）即生效。

---

## 4. sync.py 同步机制（关键！）

### 同步流程

1. **加载配置**：`load_sources()` 扫描 `sync.d/*.yml`，按文件名排序，逐个加载 YAML（优先 PyYAML，无则用内置简易解析器）
2. **配置回退**：若 `sync.d/` 不存在或无配置文件，回退到内置默认配置（向后兼容）
3. **逐源同步**：
   - 通过 GitHub API 获取上游默认分支（若 YAML 未指定 `branch`）
   - 获取递归文件树（truncated 时回退 Contents API）
   - 获取本地 `git ls-files` 的 blob SHA
   - 对比：
     - **SHA 相同** → 跳过（保留）
     - **SHA 不同** → 从上游下载并覆盖本地文件
     - **本地有但上游无** → 检查 `protected` 列表，不在则删除
   - `git add → git commit → git push`（仅当有变更时）
4. **写日志**：每次运行产出 `sync.log`，作为 Artifact 保留 7 天

### Protected 列表（不会被同步删除）

```python
GLOBAL_PROTECTED = {".github", ".git", ".gitignore", "sync.py", "sync.log",
                     "README.md", "LICENSE", "sync.d"}
```

- 每个同步运行时，per-source `protected` 与 `GLOBAL_PROTECTED` 取并集
- 顶级目录名匹配：`luci-app-passwall/luasrc/foo.lua` 的 `top` 是 `luci-app-passwall`
- 顶层文件名匹配：`README.md` 的 `top` 是 `README.md`（因为不含 `/`）

> **`.github` 和 `sync.d` 目录下的所有文件都受保护**，因为 sync.py 按顶级名字匹配。

### 对 Agent 操作的关键影响

| 操作 | 上游未变时 | 上游变了时 |
|------|-----------|-----------|
| 修改已同步目录下的已有文件 | ✅ 暂时保留（SHA 不匹配 → 下次同步时同步覆盖） | ❌ 被上游版本覆盖 |
| 在已同步目录下添加新文件 | ❌ 被下次同步删除 | ❌ 被下次同步删除 |
| 修改 protected 文件（README/sync.py 等） | ✅ 保留 | ✅ 保留 |
| 在 `sync.d/` 或 `.github/` 下添加/修改文件 | ✅ 保留 | ✅ 保留 |
| 修改 `sync.d/*.yml` 切换上游分支或添加新源 | ✅ 永久生效 | ✅ 永久生效 |

### ⚠️ 重要提醒

- **不要在已同步目录（`luci-app-*/`、`luci-theme-*/`）中放置自定义文件**，它们会在下次同步时被删除。
- **对已同步文件的修改是临时的**，上游一旦更新该文件，你的修改就会被覆盖。
- **安全的自定义位置**：`.github/` 目录、`sync.d/` 目录、`README.md`、`sync.py`、`sync.log`、`LICENSE`、`.gitignore`。
- 想保留对某个同步目录的修改？要么用 `protected` 列表保护整个目录（同步会停止更新它），要么改上游。

---

## 5. Agent 操作指南

### 操作前检查清单

1. **克隆仓库**：`gh repo clone Black0Bag/openwrt-packages-feed`
2. **阅读本文件**：`.github/AGENT_CONTEXT.md`
3. **检查最近同步状态**：查看 `sync.log` 或 GitHub Actions 运行记录
4. **确认操作安全性**：参考第 4 节的「关键影响」表

### 安全操作（不影响同步）

- 修改 `README.md`、`LICENSE`、`.gitignore`
- 修改 `sync.py`（如添加新配置字段、修改 `GLOBAL_PROTECTED`）
- 在 `.github/` 目录下添加或修改文件
- 在 `sync.d/` 目录下添加/编辑 YAML 配置文件
- 修改 GitHub Actions workflow（`.github/workflows/`）

### 危险操作（会被同步覆盖或删除）

- 修改 `luci-app-passwall/` 下的任何文件（上游更新时会覆盖）
- 在 `luci-app-passwall/` 下添加新文件（下次同步会删除）
- 其他同步目录同理

### 提交规范

- Commit message 使用简洁英文或中文均可
- 建议格式：`type: 简述`（如 `chore: add new sync source`、`docs: update AGENT_CONTEXT`）
- 不要在单次 commit 中混合无关变更

### 文档维护

- 修改仓库操作规则时，**先改本文件**（它是唯一权威信息源）
- `copilot-instructions.md` 和 `cursor-rules.mdc` 是精简指针，不需要随每次大改同步
- 所有修改通过 PR 或直接 commit 推送到 `master` 分支

---

## 6. 技术细节

| 项目 | 说明 |
|------|------|
| 同步策略 | Git Blob SHA 增量对比，仅下载变更文件 |
| 配置来源 | `sync.d/*.yml`（优先），内置默认（回退） |
| YAML 解析 | 优先用 PyYAML，不可用时用内置简易解析器 |
| per-target protected | 每个 YAML 可定义 `protected` 列表保护自定义文件 |
| API 容错 | 3 次重试 + 速率限制等待 + 30s 超时 |
| Tree 截断 | 自动回退到 Contents API 逐目录遍历 |
| 文件清理 | 同步后自动删除上游已移除的文件（`protected` 列表除外） |
| 并发控制 | workflow 级 concurrency 防止重复运行 |
| 日志 | 每次运行产出 `sync.log`，作为 Artifact 保留 7 天 |
| Token | 通过 GitHub Actions Secrets 中的 `ACCESS_TOKEN` 认证 |

---

## 7. 致谢

- [Jonnyan404](https://github.com/Jonnyan404) — cloud-clipboard-go
- [Openwrt-Passwall](https://github.com/Openwrt-Passwall) — openwrt-passwall
- [eamonxg](https://github.com/eamonxg) — luci-theme-aurora & luci-app-aurora-config

---

## 8. 维护说明

本文件由仓库所有者维护。如需更新：
- 直接编辑 `.github/AGENT_CONTEXT.md`
- 该文件受 sync.py `GLOBAL_PROTECTED` 保护，不会被自动同步删除
- 更新后请提交并推送到 `master` 分支
- 同步源添加/修改时，建议同时更新本文件第 3 节「同步源配置」表格
