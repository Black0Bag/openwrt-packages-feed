# SPDX-License-Identifier: GPL-2.0-only
#
# Copyright (C) 2026 Black0Bag <https://github.com/Black0Bag>
#
# This is free software, licensed under the GPL v2.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-memos
PKG_VERSION:=1.0.3
PKG_RELEASE:=1
PKG_LICENSE:=GPL-2.0-only

LUCI_TITLE:=LuCI 支持 Memos (usememos/memos)
LUCI_DESCRIPTION:=Memos 自托管笔记服务的 LuCI 应用。运行时从上游下载二进制到配置的 binpath。\
	支持架构与上游 linux 构建一致：aarch64/arm64、x86_64/amd64、armv7。\
	MIPS 及其他架构将被拒绝。
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+luci-base +ca-certs +curl
LUCI_MAINTAINER:=Black0Bag <https://github.com/Black0Bag>

define Package/$(PKG_NAME)/conffiles
/etc/config/memos
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/memos enable >/dev/null 2>&1 || true
	rm -f /tmp/luci-indexcache /tmp/luci-indexcache.* 2>/dev/null
	rm -rf /tmp/luci-modulecache/ 2>/dev/null
	/etc/init.d/rpcd reload 2>/dev/null || true
}
exit 0
endef

define Package/$(PKG_NAME)/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/memos disable >/dev/null 2>&1 || true
	/etc/init.d/memos stop >/dev/null 2>&1 || true
}
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
