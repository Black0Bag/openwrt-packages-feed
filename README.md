# OpenWrt Packages Feed

> ImmortalWrt 补充软件源 — 自动汇聚 GitHub 上游 OpenWrt 软件包

本仓库通过 GitHub Actions 每日自动同步上游项目的 LuCI 应用包，可直接作为 ImmortalWrt/OpenWrt 的额外 feed 使用。

## 已收录的软件包

| 软件包 | 上游仓库 | 同步路径 | 说明 |
|---|---|---|---|
| **luci-app-cloud-clipboard** | [Jonnyan404/cloud-clipboard-go](https://github.com/Jonnyan404/cloud-clipboard-go) | `openwrt/luci-app-cloud-clipboard` | 云剪贴板 LuCI 界面 |
| **luci-app-passwall** | [Openwrt-Passwall/openwrt-passwall](https://github.com/Openwrt-Passwall/openwrt-passwall) | `luci-app-passwall` | PassWall 代理管理界面 |

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
    └── 删除文件 → 清理本地
    │
    ▼
  git add → git commit → git push
    │
    ▼
  上传 sync.log artifact (保留 7 天)
```

## 仓库结构

```
openwrt-packages-feed/
├── .github/workflows/
│   └── autosync.yml          # GitHub Actions workflow
├── luci-app-cloud-clipboard/  # 云剪贴板 LuCI 包
│   ├── Makefile
│   ├── luasrc/
│   └── root/
├── luci-app-passwall/         # PassWall LuCI 包
│   ├── Makefile
│   ├── htdocs/
│   ├── luasrc/
│   ├── po/                    # 翻译文件 (zh-cn)
│   └── root/
└── sync.py                    # 自动同步脚本
```

## 添加新的同步源

编辑 [`sync.py`](./sync.py) 中的 `SOURCES` 列表，添加新的条目：

```python
SOURCES = [
    {
        "source_repo": "作者/仓库名",
        "source_path": "上游仓库中的路径",
        "target": "本仓库中的目标目录/",
    },
]
```

配置后 push 到仓库，下次 workflow 运行时即可自动同步。

## 技术细节

| 项目 | 说明 |
|---|---|
| 同步策略 | Git Blob SHA 增量对比，仅下载变更文件 |
| API 容错 | 3 次重试 + 速率限制等待 + 30s 超时 |
| Tree 截断 | 自动回退到 Contents API 逐目录遍历 |
| 文件清理 | 同步后自动删除上游已移除的文件（保护 `.github` 目录） |
| 并发控制 | workflow 级 concurrency 防止重复运行 |
| 日志 | 每次运行产出 `sync.log`，作为 Artifact 保留 7 天 |

## 致谢

- [Jonnyan404](https://github.com/Jonnyan404) — cloud-clipboard-go
- [Openwrt-Passwall](https://github.com/Openwrt-Passwall) — openwrt-passwall

## 许可证

各软件包的版权与许可证归上游项目所有，请查阅对应仓库。
