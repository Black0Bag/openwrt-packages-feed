# Agent Context — openwrt-packages-feed

> **任何 AI Agent 在操作本仓库前，务必先完整阅读本文件。**
> 本文件是仓库的"操作手册"，记录了仓库结构、同步机制、安全规则和注意事项。
> 文件位置：`.github/AGENT_CONTEXT.md`（受 sync.py 的 protected 列表保护，不会被自动同步删除）。

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
├── sync.d/                             # 同步源配置目录（受保护）
│   ├── luci-app-cloud-clipboard.yml    # 云剪贴板同步规则
│   ├── luci-app-passwall.yml           # PassWall 同步规则
│   ├── luci-theme-aurora.yml           # Aurora 主题同步规则
│   └── luci-app-aurora-config.yml      # Aurora 配置同步规则
├── .github/                            # GitHub 配置目录（整体受保护）
│   ├── AGENT_CONTEXT.md                # ← 你正在阅读的文件
│   ├── copilot-instructions.md         # GitHub Copilot 上下文
│   ├── cursor-rules.mdc                # Cursor / Windsurf rules
│   └── workflows/
│       └── autosync.yml                # GitHub Actions workflow
├── luci-app-cloud-clipboard/           # 云剪贴板 LuCI 界面（上游同步）
├── luci-app-passwall/                  # PassWall 代理管理界面（上游同步）
├── luci-theme-aurora/                  # Aurora 主题（上游同步）
└── luci-app-aurora-config/             # Aurora 主题配置应用（上游同步）
```

---

## 3. 同步源配置

| 目标目录 | 上游仓库 | 上游路径 | 默认分支 | 排除项 |
|---------|---------|---------|---------|--------|
| `luci-app-cloud-clipboard/` | `Jonnyan404/cloud-clipboard-go` | `openwrt/luci-app-cloud-clipboard` | `main` | 无 |
| `luci-app-passwall/` | `Openwrt-Passwall/openwrt-passwall` | `luci-app-passwall` | `main` | 无 |
| `luci-theme-aurora/` | `eamonxg/luci-theme-aurora` | `(根目录)` | `master` | `.claude` `.dev` `.vscode` `.github` `.gitignore` `CLAUDE.md` `README.md` `README_zh.md` |
| `luci-app-aurora-config/` | `eamonxg/luci-app-aurora-config` | `(根目录)` | `master` | `.github` `.gitignore` `README.md` `README_zh.md` `docs` `tests` `package.json` |

---

## 4. sync.py 同步机制（关键！）

### 同步流程
1. 通过 GitHub API 获取上游仓库默认分支的递归文件树
2. 获取本地 Git tracked 文件的 blob SHA
3. 逐个对比远程文件 SHA 与本地 SHA：
   - **SHA 相同** → 跳过（保持不变）
   - **SHA 不同** → 从上游下载并覆盖本地文件
   - **本地有但上游无** → 检查是否在 protected 列表，不在则删除
4. `git add → git commit → git push`（仅当有变更时）
5. 输出 `sync.log`

### Protected 列表（不会被同步删除）
```python
GLOBAL_PROTECTED = {".github", ".git", ".gitignore", "sync.py", "sync.log",
                     "README.md", "LICENSE", "sync.d"}
```
> **`.github` 和 `sync.d` 目录下的所有文件都受保护**，因为 sync.py 按顶级目录名匹配。
> 每个 YAML 配置还可以定义自己的 `protected` 列表用于保护该目录下的自定义文件。

### 对 Agent 操作的关键影响

| 操作 | 上游未变时 | 上游变了时 |
|------|-----------|-----------|
| 修改已同步目录下的已有文件 | ✅ 暂时保留（SHA 不匹配 → 下次上游更新时会被覆盖） | ❌ 被上游版本覆盖 |
| 在已同步目录下添加新文件 | ❌ 被下次同步删除 | ❌ 被下次同步删除 |
| 修改 protected 文件（README/sync.py 等） | ✅ 保留 | ✅ 保留 |
| 在 `.github/` 下添加文件 | ✅ 保留 | ✅ 保留 |

### ⚠️ 重要提醒
- **不要在已同步目录（`luci-app-*/`、`luci-theme-*/`）中放置自定义文件**，它们会在下次同步时被删除。
- **对已同步文件的修改是临时的**，上游一旦更新该文件，你的修改就会被覆盖。
- **安全的自定义位置**：`.github/` 目录、`README.md`、`sync.py`、`sync.log`、`LICENSE`、`.gitignore`。
- 如果需要永久保留对某个同步目录的修改，请修改 `sync.py` 的 `protected` 列表或 `exclude` 配置。

---

## 5. Agent 操作指南

### 操作前检查清单
1. **克隆仓库**：`gh repo clone Black0Bag/openwrt-packages-feed`
2. **阅读本文件**：`.github/AGENT_CONTEXT.md`
3. **检查最近同步状态**：查看 `sync.log` 或 GitHub Actions 运行记录
4. **确认操作安全性**：参考第 4 节的"关键影响"表

### 安全操作（不影响同步）
- 修改 `README.md`、`LICENSE`、`.gitignore`
- 修改 `sync.py`（如添加/删除同步源、修改 protected/exclude 配置）
- 在 `.github/` 目录下添加或修改文件
- 修改 GitHub Actions workflow（`.github/workflows/`）

### 危险操作（会被同步覆盖或删除）
- 修改 `luci-app-passwall/` 下的任何文件（上游更新时会覆盖）
- 在 `luci-app-passwall/` 下添加新文件（下次同步会删除）
- 其他同步目录同上

### 添加或修改同步源
1. 在 `sync.d/` 目录下创建新的 `.yml` 文件（如 `luci-app-example.yml`）
2. 文件格式：
   ```yaml
   # 同步规则: luci-app-example
   source_repo: "上游作者/仓库名"
   source_path: "上游仓库中的路径（空字符串表示根目录）"
   target: "本仓库中的目标目录/"
   exclude: ["item1", "item2"]    # 可选，排除项列表
   description: "描述信息"         # 可选，仅用于日志
   branch: ""                     # 可选，空则自动获取上游默认分支
   protected: ["my-custom-dir"]   # 可选，该源自定义的 protected 项
   ```
3. 提交并推送，下次 GitHub Actions 自动运行时生效
4. 也可在 GitHub Actions 页面手动触发 workflow 立即测试

### 提交规范
- Commit message 使用简洁英文或中文均可
- 建议格式：`type: 简述`（如 `chore: add new sync source`）
- 不要在单次 commit 中混合无关变更

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
| 文件清理 | 同步后自动删除上游已移除的文件（protected 列表除外） |
| 并发控制 | workflow 级 concurrency 防止重复运行 |
| 日志 | 每次运行产出 `sync.log`，作为 Artifact 保留 7 天 |
| Token | 通过 GitHub Actions Secrets 中的 `GH_TOKEN` 认证 |

---

## 7. 致谢

- [Jonnyan404](https://github.com/Jonnyan404) — cloud-clipboard-go
- [Openwrt-Passwall](https://github.com/Openwrt-Passwall) — openwrt-passwall
- [eamonxg](https://github.com/eamonxg) — luci-theme-aurora & luci-app-aurora-config

---

## 8. 维护说明

本文件由仓库所有者维护。如需更新：
- 直接编辑 `.github/AGENT_CONTEXT.md`
- 该文件受 sync.py protected 保护，不会被自动同步删除
- 更新后请提交并推送到 `master` 分支
