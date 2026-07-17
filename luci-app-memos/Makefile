# SPDX-License-Identifier: GPL-2.0-only
#
# Copyright (C) 2026 Black0Bag <https://github.com/Black0Bag>
#
# This is free software, licensed under the GPL v2.
#

include /rules.mk

PKG_NAME:=luci-app-memos
PKG_MAINTAINER:=Black0Bag <https://github.com/Black0Bag>
PKG_VERSION:=1.0.0
PKG_RELEASE:=3
PKG_LICENSE:=GPL-2.0-only

LUCI_TITLE:=LuCI support for Memos (usememos/memos)
LUCI_DESCRIPTION:=LuCI application for Memos, a self-hosted note-taking service. \
	Downloads the upstream memos binary at runtime into /usr/bin/memos. \
	Only aarch64/arm64 and x86_64/amd64 are supported (upstream publishes \
	those two linux builds). MIPS and other architectures are rejected.
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+luci-base +ca-certs +curl

define Package//conffiles
/etc/config/memos
endef

define Package//install
	 1/etc/init.d
	 ./root/etc/init.d/memos 1/etc/init.d/memos
	 1/etc/config
	 ./root/etc/config/memos 1/etc/config/memos
	 1/etc/uci-defaults
	 ./root/etc/uci-defaults/99-luci-app-memos 1/etc/uci-defaults/99-luci-app-memos
	 1/usr/share/memos
	 ./root/usr/share/memos/memos.sh 1/usr/share/memos/memos.sh
	 1/usr/share/luci/menu.d
	 ./root/usr/share/luci/menu.d/luci-app-memos.json 1/usr/share/luci/menu.d/luci-app-memos.json
	 1/usr/share/rpcd/acl.d
	 ./root/usr/share/rpcd/acl.d/luci-app-memos.json 1/usr/share/rpcd/acl.d/luci-app-memos.json
endef

define Package//postinst
#!/bin/sh
[ -z "{IPKG_INSTROOT}" ] || exit 0
/etc/init.d/memos enable >/dev/null 2>&1 || true
rm -f /tmp/luci-indexcache
rm -f /tmp/luci-modulecache/* 2>/dev/null
exit 0
endef

define Package//prerm
#!/bin/sh
[ -z "{IPKG_INSTROOT}" ] || exit 0
/etc/init.d/memos disable >/dev/null 2>&1 || true
/etc/init.d/memos stop >/dev/null 2>&1 || true
exit 0
endef

include /feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
