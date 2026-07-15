# OpenWrt Packages Feed

> **AI Agent 请先阅读 [`.github/AGENT_CONTEXT.md`](.github/AGENT_CONTEXT.md) 再操作本仓库。**

> ImmortalWrt 补充软件源 — 自动汇聚 GitHub 上游 OpenWrt 软件包

本仓库通过 GitHub Actions 每日自动同步上游项目的 LuCI 应用包，可直接作为 ImmortalWrt/OpenWrt 的额外 feed 使用。

## 已收录的软件包

| 软件包 | 上游仓库 | 同步路径 | 配置文件 |
|---|---|---|---|
| **luci-app-cloud-clipboard** | [Jonnyan404/cloud-clipboard-go](https://github.com/Jonnyan404/cloud-clipboard-go) | `openwrt/luci-app-cloud-clipboard` | `sync.d/luci-app-cloud-clipboard.yml` |
| **luci-app-passwall** | [Openwrt-Passwall/openwrt-passwall](https://github.com/Openwrt-Passwall/openwrt-passwall) | `luci-app-passwall` | `sync.d/luci-app-passwall.yml` |
| **luci-theme-aurora** | [eamonxg/luci-theme-aurora](https://github.com/eamonxg/luci-theme-aurora) | `(仓库根目录)` | `sync.d/luci-theme-aurora.yml` |
| **luci-app-aurora-config** | [eamonxg/luci-app-aurora-config](https://github.com/eamonxg/luci-app-aurora-config) | `(仓库根目录)` | `sync.d/luci-app-aurora-config.yml` |

## 使用方法

### 1. 添加 feed

在你的 OpenWrt/ImmortalWrt 编译目录中，将本仓库添加为额外 feed：

```bash
# 在 openwrt 源码根目录执行
echo "src-git extra_packages https://github.com/Black0Bag/openwrt-packages-feed.git;master" >> feeds.conf.default

# 更新并安装 feed
./scripts/feeds update extra_packages
./scripts/feeds install -a -p extra_packages
```

### 2. 编译

```bash
make menuconfig    # 在 LuCI -> Applications 中选中所需要的包
make package/luci-app-passwall/compile V=s
# 或直接编译全部
make -j$(nproc)
```

## 自动同步机制

本仓库通过 [GitHub Actions](https://github.com/Black0Bag/openwrt-packages-feed/actions) 实现每日自动同步：

- **同步时间**：每天 UTC 03:00（北京时间 11:00）
- **同步方式**：通过 GitHub API 对比文件 SHA，仅下载有变更的文件
- **自动提交**：检测到变更后自动 commit 并 push
- **手动触发**：可在 Actions 页面手动运行 `Daily Auto-sync` workflow

### 同步流程

```
同步源配置 (sync.d/*.yml)
    │
    ▼
上游仓库 (GitHub API)
    │
    ▼
  获取默认分支 + 递归 Tree
    │
    ▼
  对比本地 Git Blob SHA
    │
    ├── 新增文件 → 下载并写入
    ├── 更新文件 → 下载并覆盖
    └── 删除文件 → 清理本地（受 protected 列表保护）
    │
    ▼
  git add → git commit → git push
    │
    ▼
  上传 sync.log artifact (保留 7 天)
```

## 添加新的同步源

> ⚠️ 同步源配置已外部化为 `sync.d/*.yml` 文件，**无需修改 `sync.py`**。

在 [`sync.d/`](./sync.d/) 目录下创建新的 YAML 文件，例如 `sync.d/luci-app-example.yml`：

```yaml
# 同步规则描述
source_repo: "上游作者/仓库名"
source_path: "上游仓库中的路径（空字符串表示根目录）"
target: "本仓库中的目标目录/"
exclude:          # 可选：排除的文件/目录（按顶层名匹配）
  - "README.md"
  - ".github"
description: "简介"   # 可选：仅用于日志
branch: ""            # 可选：指定分支，空则自动获取上游默认分支
protected: []         # 可选：该源自定义的 protected 项
```

提交并 push 后，下次 GitHub Actions 自动运行时即生效，也可在 Actions 页面手动触发即时测试。

## sync.d 配置目录

| 配置文件 | 作用 |
|---------|------|
| `sync.d/luci-app-cloud-clipboard.yml` | 云剪贴板同步规则 |
| `sync.d/luci-app-passwall.yml` | PassWall 同步规则 |
| `sync.d/luci-theme-aurora.yml` | Aurora 主题同步规则（含 exclude 配置） |
| `sync.d/luci-app-aurora-config.yml` | Aurora 配置同步规则（含 exclude 配置） |

> `sync.d/` 目录受 `GLOBAL_PROTECTED = {".github", ..., "sync.d"}` 保护，不会被自动同步删除。

## 技术细节

| 项目 | 说明 |
|---|---|
| 同步策略 | Git Blob SHA 增量对比，仅下载变更文件 |
| 配置来源 | `sync.d/*.yml`（优先），内置默认（回退） |
| YAML 解析 | 优先用 PyYAML，不可用时用内置简易解析器 |
| per-target protected | 每个 YAML 可定义 `protected` 列表保护自定义文件 |
| API 容错 | 3 次重试 + 速率限制等待 + 30s 超时 |
| Tree 截断 | 自动回退到 Contents API 逐目录遍历 |
| 文件清理 | 同步后自动删除上游已移除的文件（保护 `.github`/`sync.d` 等目录） |
| 并发控制 | workflow 级 concurrency 防止重复运行 |
| 日志 | 每次运行产出 `sync.log`，作为 Artifact 保留 7 天 |

## 致谢

- [Jonnyan404](https://github.com/Jonnyan404) — cloud-clipboard-go
- [Openwrt-Passwall](https://github.com/Openwrt-Passwall) — openwrt-passwall
- [eamonxg](https://github.com/eamonxg) — luci-theme-aurora & luci-app-aurora-config

## 许可证

各软件包的版权与许可证归上游项目所有，请查阅对应仓库。

## AI Agent 操作指引

如果使用 AI Agent（如 Copilot、Cursor、Claude Code、小万/Omnibot 等）操作本仓库，请确保 Agent 首先阅读以下文件：

| 文件 | 适用 Agent | 说明 |
|------|----------|------|
| [`.github/AGENT_CONTEXT.md`](.github/AGENT_CONTEXT.md) | 所有 Agent | **主信息源**——完整的仓库上下文、同步机制、安全规则 |
| [`.github/copilot-instructions.md`](.github/copilot-instructions.md) | GitHub Copilot | Copilot 自动读取的精简指针（指向 AGENT_CONTEXT） |
| [`.github/cursor-rules.mdc`](.github/cursor-rules.mdc) | Cursor / Windsurf | Cursor rules 格式（指向 AGENT_CONTEXT） |

> 这些文件位于 `.github/` 目录下，受 `sync.py` 的 `GLOBAL_PROTECTED` 列表保护，不会被自动同步删除。
> **修改优先级**：优先改 `AGENT_CONTEXT.md`（唯一权威信息源），其他两个文件只是快捷入口。
