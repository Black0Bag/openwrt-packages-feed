# OpenWrt Packages Feed

> **AI Agent 请先阅读 [`.github/AGENT_CONTEXT.md`](.github/AGENT_CONTEXT.md) 再操作本仓库。**

> ImmortalWrt 补充软件源 — 自动汇聚 GitHub 上游 OpenWrt 软件包

通过 GitHub Actions 每日自动同步上游 LuCI 应用包和主题。

## 已收录的软件包

| 软件包 | 上游仓库 | 配置文件 |
|---|---|---|
| **luci-app-cloud-clipboard** | [Jonnyan404/cloud-clipboard-go](https://github.com/Jonnyan404/cloud-clipboard-go) | `sync.d/luci-app-cloud-clipboard.yml` |
| **luci-app-passwall** | [Openwrt-Passwall/openwrt-passwall](https://github.com/Openwrt-Passwall/openwrt-passwall) | `sync.d/luci-app-passwall.yml` |
| **luci-theme-aurora** | [eamonxg/luci-theme-aurora](https://github.com/eamonxg/luci-theme-aurora) | `sync.d/luci-theme-aurora.yml` |
| **luci-app-aurora-config** | [eamonxg/luci-app-aurora-config](https://github.com/eamonxg/luci-app-aurora-config) | `sync.d/luci-app-aurora-config.yml` |

## 使用方法

```bash
# 添加 feed
echo "src-git extra_packages https://github.com/Black0Bag/openwrt-packages-feed.git;master" >> feeds.conf.default
./scripts/feeds update extra_packages
./scripts/feeds install -a -p extra_packages

# 编译
make menuconfig
make -j$(nproc)
```

## 自动同步

GitHub Actions 每日 UTC 03:00 自动运行 `sync.py`，通过文件 SHA 增量同步上游。手动触发可在 Actions 页面运行。

## 添加新的同步源

在 `sync.d/` 下创建 YAML 文件即可，无需改 `sync.py`：

```yaml
source_repo: "owner/repo"
source_path: ""
target: "luci-app-example/"
exclude: ["README.md", ".github"]
branch: ""
protected: []
```

## 致谢

- [Jonnyan404](https://github.com/Jonnyan404) — cloud-clipboard-go
- [Openwrt-Passwall](https://github.com/Openwrt-Passwall) — openwrt-passwall
- [eamonxg](https://github.com/eamonxg) — luci-theme-aurora & luci-app-aurora-config

## 许可证

各软件包的版权与许可证归上游项目所有，请查阅对应仓库。
