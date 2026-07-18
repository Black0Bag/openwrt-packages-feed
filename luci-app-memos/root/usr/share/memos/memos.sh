#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-only
#
# memos.sh - luci-app-memos 核心脚本（版本检查 / 下载 / 更新 / 取消）
# 由 LuCI overview.js（rpcd ACL + fs.exec）与 init.d/memos（缺 bin 开机自救）调用。
#
# 子命令:
#   check    : 查询上游；stdout 一行固定协议: state local remote arch
#              （无本地二进制时 local 为 "-"）
#              退出码: 0=已最新 1=需更新/缺失 2=错误
#              check 不抢更新锁
#   version  : 打印本地版本（空表示未安装），便于自定义 binpath 共用 ACL
#   download : 强制下载安装当前通道最新版
#   update   : 仅当本地与远程不同时下载
#   cancel   : 取消持有锁的下载/更新
#
# 定时任务示例: memos.sh update

set -u

PATH="/usr/sbin:/usr/bin:/sbin:/bin"

CONFIG_SECTION="memos"
UPDATE_DIR="/var/run/memos_update.lock"
LOCK_PID_FILE="${UPDATE_DIR}/pid"
LOG_FILE="/tmp/memos_update.log"
TMP_DIR="/tmp/memos-update"
UPSTREAM_REPO="usememos/memos"
UPSTREAM_BIN_NAME="memos"

# 仅写日志文件，不污染 stdout（check 协议需可解析）
log() { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG_FILE" 2>/dev/null; }
# 用户可见进度（同时写入日志）
say() { log "$*"; echo "$*"; }
die() { echo "错误: $*" >&2; log "错误: $*"; cleanup 1; }

uciget() { uci -q get "${CONFIG_SECTION}.${CONFIG_SECTION}.$1" 2>/dev/null; }

get_binpath()  { uciget binpath  || echo "/usr/bin/memos"; }
get_channel()  { local c; c="$(uciget release_channel)"; [ -z "$c" ] && c="stable"; echo "$c"; }
get_data_dir() { local d; d="$(uciget data)";     [ -z "$d" ] && d="/etc/memos";    echo "$d"; }

# 仅用于 github.com 资源下载的镜像前缀（API 始终直连，见 api_get）
prefix_for() {
	local mirror
	mirror="$(uciget mirror)"
	[ -z "$mirror" ] && mirror="official"
	case "$mirror" in
		official)  echo "" ;;
		ghproxy)   echo "https://ghproxy.com/" ;;
		gh-proxy)  echo "https://gh-proxy.com/" ;;
		gitmirror) echo "https://hub.gitmirror.com/" ;;
		moeyy)     echo "https://github.moeyy.xyz/" ;;
		custom)    uciget mirror_custom ;;
		*)         echo "" ;;
	esac
}

apply_prefix() {
	local url="$1"
	local prefix
	prefix="$(prefix_for)"
	echo "${prefix}${url}"
}

# 上游当前提供: linux_amd64, linux_arm64, linux_armv7
detect_arch() {
	local raw
	raw="$(opkg info kernel 2>/dev/null | awk '/^Architecture:/{print $2}' | head -1)"
	[ -z "$raw" ] && raw="$(apk info --architecture 2>/dev/null)"
	[ -z "$raw" ] && raw="$(uname -m)"
	raw="$(echo "$raw" | tr -d '[:space:]')"

	case "$raw" in
		aarch64*|arm64*)              echo "linux_arm64" ;;
		x86_64*|x86-64*|amd64*)       echo "linux_amd64" ;;
		armv7*|armhf*|arm_*)          echo "linux_armv7" ;;
		arm)                          echo "linux_armv7" ;;
		*)                            return 1 ;;
	esac
}

# 原子锁（mkdir）；锁目录内记录持有者 PID
release_lock() {
	if [ ! -d "$UPDATE_DIR" ]; then
		return 0
	fi
	if [ -f "$LOCK_PID_FILE" ]; then
		local owner
		owner="$(cat "$LOCK_PID_FILE" 2>/dev/null)"
		if [ "$owner" = "$$" ] || [ -z "$owner" ]; then
			rm -rf "$UPDATE_DIR" 2>/dev/null
		fi
	else
		rm -rf "$UPDATE_DIR" 2>/dev/null
	fi
}

cleanup() {
	local rc="${1:-0}"
	release_lock
	[ -d "$TMP_DIR" ] && rm -rf "$TMP_DIR" 2>/dev/null
	exit "$rc"
}

trap 'cleanup 1' INT TERM HUP

enter() {
	if ! mkdir "$UPDATE_DIR" 2>/dev/null; then
		echo "忙碌: 已有更新任务在进行" >&2
		exit 3
	fi
	echo "$$" > "$LOCK_PID_FILE"
	: > "$LOG_FILE"
	mkdir -p "$TMP_DIR"
}

# GitHub API 始终直连（多数镜像只代理资源下载，不代理 api.github.com）
api_get() {
	local url="$1"
	curl -fsSL --connect-timeout 15 --max-time 30 -H 'Accept: application/vnd.github+json' \
		"$url" 2>/dev/null
}

latest_release_tag() {
	local channel tag
	channel="$(get_channel)"
	if [ "$channel" = "beta" ]; then
		tag=$(api_get "https://api.github.com/repos/${UPSTREAM_REPO}/releases" \
			| sed -nE 's/.*"tag_name": *"([^"]+)".*/\1/p' | head -1)
	else
		tag=$(api_get "https://api.github.com/repos/${UPSTREAM_REPO}/releases/latest" \
			| sed -nE 's/.*"tag_name": *"([^"]+)".*/\1/p' | head -1)
	fi
	[ -z "$tag" ] && return 1
	echo "$tag"
}

asset_url_for() {
	local tag="$1" arch="$2" want pattern
	want="${UPSTREAM_BIN_NAME}_${tag#v}_${arch}.tar.gz"
	pattern="$(echo "$want" | sed 's/[.]/\\./g')"
	api_get "https://api.github.com/repos/${UPSTREAM_REPO}/releases/tags/${tag}" \
		| sed -nE 's/.*"browser_download_url": *"([^"]+)".*/\1/p' \
		| grep -E "/${pattern}$" | head -1
}

local_version() {
	local binpath
	binpath="$(get_binpath)"
	[ -x "$binpath" ] || { echo ""; return 0; }
	"$binpath" version 2>/dev/null | tr -dc '0-9.'
}

# check 不占更新锁，也不写 LOG_FILE
op_check() {
	local local_v remote_v arch

	arch="$(detect_arch)" || {
		echo "error - - -"
		exit 2
	}

	remote_v="$(latest_release_tag)" || {
		echo "error - - $arch"
		exit 2
	}
	remote_v="${remote_v#v}"
	local_v="$(local_version)"

	if [ -n "$local_v" ] && [ "$local_v" = "$remote_v" ]; then
		echo "uptodate $local_v $remote_v $arch"
		exit 0
	fi

	if [ -z "$local_v" ]; then
		echo "missing - $remote_v $arch"
		exit 1
	fi

	echo "outdated $local_v $remote_v $arch"
	exit 1
}

op_version() {
	local_version
	exit 0
}

install_asset() {
	local tag="$1" arch="$2" url asset_name real_tar tmp_bin sum_expected sum_actual binpath data_dir
	url="$(asset_url_for "$tag" "$arch")"
	[ -z "$url" ] && die "未找到资源 tag=$tag arch=$arch"

	asset_name="${UPSTREAM_BIN_NAME}_${tag#v}_${arch}.tar.gz"
	real_tar="$TMP_DIR/$asset_name"

	say "正在下载 $url"
	curl -fsSL --connect-timeout 15 --max-time 300 \
		-o "$real_tar" "$(apply_prefix "$url")" 2>>"$LOG_FILE" \
		|| die "下载失败"

	sum_expected=$(
		curl -fsSL --connect-timeout 15 --max-time 30 \
			"$(apply_prefix "https://github.com/${UPSTREAM_REPO}/releases/download/${tag}/checksums.txt")" 2>/dev/null \
			| awk -v f="$asset_name" '$2 == f {print $1; exit}'
	)
	if [ -n "$sum_expected" ]; then
		sum_actual=$(sha256sum "$real_tar" 2>/dev/null | awk '{print $1}')
		[ -n "$sum_actual" ] || die "系统无 sha256sum"
		if [ "$sum_actual" != "$sum_expected" ]; then
			die "校验和不匹配 (实际 $(echo "$sum_actual" | cut -c1-12)... 期望 $(echo "$sum_expected" | cut -c1-12)...)"
		fi
		say "校验和通过"
	else
		say "上游未提供 $tag 的 checksums.txt，跳过校验"
	fi

	say "正在解压"
	tar -zxf "$real_tar" -C "$TMP_DIR" 2>>"$LOG_FILE" || die "解压失败"
	tmp_bin="$TMP_DIR/${UPSTREAM_BIN_NAME}"
	[ -f "$tmp_bin" ] || tmp_bin="$TMP_DIR/${tag}/${UPSTREAM_BIN_NAME}"
	[ -f "$tmp_bin" ] || die "压缩包中未找到二进制文件"

	binpath="$(get_binpath)"
	data_dir="$(get_data_dir)"

	/etc/init.d/memos stop >/dev/null 2>&1

	mkdir -p "${binpath%/*}" "${data_dir}" 2>/dev/null

	if [ -x "$binpath" ]; then
		mv -f "$binpath" "${binpath}.old" 2>/dev/null
	fi

	say "正在安装到 $binpath"
	if ! mv -f "$tmp_bin" "$binpath" 2>/dev/null; then
		[ -f "${binpath}.old" ] && mv -f "${binpath}.old" "$binpath" 2>/dev/null
		die "安装新二进制失败"
	fi
	chmod 755 "$binpath" 2>/dev/null

	if [ "$(uciget enabled)" = "1" ]; then
		say "正在启动服务"
		if /etc/init.d/memos start >/dev/null 2>&1; then
			# 服务启动成功，旧二进制可安全删除
			rm -f "${binpath}.old" 2>/dev/null
		else
			# 启动失败：把旧二进制移回原位（.old 经此 mv 不再存在）
			[ -f "${binpath}.old" ] && mv -f "${binpath}.old" "$binpath" 2>/dev/null
			say "更新后启动服务返回非零，已回滚到旧二进制"
			cleanup 1
		fi
	else
		# 服务未启用：新二进制就位即可，删除旧备份
		rm -f "${binpath}.old" 2>/dev/null
	fi

	say "已成功安装 ${UPSTREAM_BIN_NAME} ${tag#v}"
	echo "ok ${tag#v} $arch"
	cleanup 0
}

op_download() {
	enter
	local remote_v arch
	arch="$(detect_arch)" || die "当前架构上游不支持"
	remote_v="$(latest_release_tag)" || die "获取最新版本标签失败"
	remote_v="${remote_v#v}"
	say "正在下载最新版 ($remote_v) 架构 $arch"
	install_asset "v${remote_v}" "$arch"
}

op_update() {
	enter
	local local_v remote_v arch
	arch="$(detect_arch)" || die "当前架构上游不支持"

	remote_v="$(latest_release_tag)" || die "获取最新版本标签失败"
	remote_v="${remote_v#v}"
	local_v="$(local_version)"

	if [ -n "$local_v" ] && [ "$local_v" = "$remote_v" ]; then
		say "无需更新 (本地=$local_v 远程=$remote_v)"
		echo "uptodate $local_v $remote_v $arch"
		cleanup 0
	fi

	say "正在从 ${local_v:-无} 更新到 $remote_v"
	install_asset "v${remote_v}" "$arch"
}

op_cancel() {
	local owner binpath
	if [ ! -d "$UPDATE_DIR" ]; then
		echo idle
		exit 0
	fi

	owner="$(cat "$LOCK_PID_FILE" 2>/dev/null)"
	if [ -n "$owner" ] && [ "$owner" -gt 1 ] 2>/dev/null; then
		# 先杀持有锁的进程及其子进程（curl/tar 等）
		kill "$owner" 2>/dev/null || true
		pgrep -f "$UPDATE_SCRIPT" 2>/dev/null | while read -r pid; do
			[ "$pid" != "$$" ] && kill "$pid" 2>/dev/null || true
		done
		# 给被杀进程一点时间退出，避免锁目录被 stat 卡住
		sleep 1
	fi

	rm -rf "$UPDATE_DIR" 2>/dev/null
	[ -d "$TMP_DIR" ] && rm -rf "$TMP_DIR" 2>/dev/null

	# 清理可能残留的半安装 .old 二进制（cancel 在 mv 成功后切入会留下 .old）
	binpath="$(get_binpath)"
	[ -f "${binpath}.old" ] && rm -f "${binpath}.old" 2>/dev/null

	log "用户已取消"
	echo cancelled
	exit 0
}

case "${1:-}" in
	check)    op_check ;;
	version)  op_version ;;
	download) op_download ;;
	update)   op_update ;;
	cancel)   op_cancel ;;
	*)
		echo "用法: $0 {check|version|download|update|cancel}" >&2
		exit 2
		;;
esac
