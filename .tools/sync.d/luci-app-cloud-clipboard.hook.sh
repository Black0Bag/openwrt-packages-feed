#!/bin/bash
set -euo pipefail

# post_sync hook for luci-app-cloud-clipboard
# Download cloud-clipboard binary from GitHub release and place it in root/usr/bin/
# 权限由 Makefile 的 INSTALL_BIN 在构建时设置

mkdir -p "luci-app-cloud-clipboard/root/usr/bin"

curl -sL "https://github.com/Jonnyan404/cloud-clipboard-go/releases/download/v4.7.5/cloud-clipboard-go_Linux_aarch64.tar.gz" \
  | tar -xz -C /tmp cloud-clipboard

cp /tmp/cloud-clipboard "luci-app-cloud-clipboard/root/usr/bin/"
