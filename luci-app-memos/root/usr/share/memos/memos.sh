#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-only
#
# memos.sh - core update / version-check script for luci-app-memos.
# Invoked by LuCI overview.js (via fs.exec through rpcd ACL) and by init.d/memos
# (auto-rescue when the binary is missing at boot).
#
# Sub-commands:
#   check    : query upstream releases for the latest version matching the
#              configured channel (stable/beta) and write a one-line summary
#              to stdout. Exit 0 when local is up-to-date, 1 when needs
#              update, 2 on error.
#   download : download + extract + install the latest binary matching the
#              configured channel, regardless of local version. Used for the
#              "download" button when no binary is present. Exit 0 on success.
#   update   : like download, but only acts when check reports a newer remote
#              version. Used for the "update" button.
#   cancel   : kill any in-flight download/update, removing the lock and the
#              temp scratch dir.
#
# Usage from outside (e.g. cron):  memos.sh update

set -u

PATH="/usr/sbin:/usr/bin:/sbin:/bin"

CONFIG_SECTION="memos"
UPDATE_LOCK="/var/run/memos_update"
ERROR_FLAG="/var/run/memos_update_error"
LOG_FILE="/tmp/memos_update.log"
TMP_DIR="/tmp/memos-update"
UPSTREAM_REPO="usememos/memos"
UPSTREAM_BIN_NAME="memos"

log() { echo "[$(date '+%H:%M:%S')] $*" >> "$LOG_FILE" 2>/dev/null; echo "$*"; }
die() { echo "error: $*" >&2; log "ERROR: $*"; cleanup 1; }

# ---- config helpers ----------------------------------------------------------
uciget() { uci -q get "${CONFIG_SECTION}.${CONFIG_SECTION}.$1" 2>/dev/null; }

get_binpath()  { uciget binpath  || echo "/usr/bin/memos"; }
get_channel()  { local c; c="$(uciget release_channel)"; [ -z "$c" ] && c="stable"; echo "$c"; }
get_data_dir() { local d; d="$(uciget data)";     [ -z "$d" ] && d="/etc/memos";    echo "$d"; }

# --- mirror prefix composer ---
# Returns the prefix that gets prepended to github.com/... URLs.
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
		jsdelivr)  echo "https://cdn.jsdelivr.net/gh/" ;;
		custom)    uciget mirror_custom ;;
		*)         echo "" ;;
	esac
}

# Apply the prefix to a github asset URL. For jsdelivr the URL form differs
# (jsdelivr serves raw gh contents, not release assets), so fall back to the
# raw prefix for that channel.
apply_prefix() {
	local url="$1"
	local prefix
	prefix="$(prefix_for)"
	case "$(uciget mirror || echo official)" in
		jsdelivr)
			# Turn https://github.com/USEMEMOS/memos/releases/download/v0.29.1/x
			# into https://cdn.jsdelivr.net/gh/USEMEMOS/memos@v0.29.1/x
			# jsdelivr does not actually mirror /releases/download, so this is
			# best-effort and may fail; documented in README. Falls through.
			echo "${url}" | sed -E \
				's|https?://github.com/([^/]+)/([^/]+)/releases/download/([^/]+)/(.*)|https://cdn.jsdelivr.net/gh/\1/\2@\3/\4|'
			;;
		*)
			echo "${prefix}${url}"
			;;
	esac
}

# ---- arch detection ----------------------------------------------------------
# Only arm64 and amd64 are supported because upstream only publishes those two
# linux builds. Everything else, including all MIPS variants, is rejected.
detect_arch() {
	local raw
	raw="$(opkg info kernel 2>/dev/null | awk '/^Architecture:/{print $2}' | head -1)"
	[ -z "$raw" ] && raw="$(apk info --architecture 2>/dev/null)"
	[ -z "$raw" ] && raw="$(uname -m)"
	raw="$(echo "$raw" | tr -d '[:space:]')"

	case "$raw" in
		aarch64|arm64)          echo "linux_arm64" ;;
		x86_64|x86-64|amd64)    echo "linux_amd64" ;;
		i386|i686)              echo "linux_386" ;;
		*)
			log "unsupported arch: $raw"
			return 1
			;;
	esac
}

# ---- semaphore + cleanup ----------------------------------------------------
cleanup() {
	local rc="${1:-0}"
	rm -f "$UPDATE_LOCK" 2>/dev/null
	[ "$rc" != "0" ] && touch "$ERROR_FLAG"
	[ -d "$TMP_DIR" ] && rm -rf "$TMP_DIR" 2>/dev/null
	exit "$rc"
}

trap 'cleanup 1' INT TERM HUP

enter() {
	if [ -f "$UPDATE_LOCK" ]; then
		echo "busy: another update is in progress" >&2
		exit 3
	fi
	: > "$UPDATE_LOCK"
	rm -f "$ERROR_FLAG" 2>/dev/null
	mkdir -p "$TMP_DIR"
}

# ---- github api --------------------------------------------------------------
# Uses curl (build-time dependency of luci-app-memos); we never try to
# opkg-install curl at runtime - that would fail on offline / read-only setups.
api_get() {
	local url="$1"
	curl -fsSL --connect-timeout 15 --max-time 30 -H 'Accept: application/vnd.github+json' \
		"$(apply_prefix "$url")" 2>/dev/null
}

# Returns latest tag matching the configured channel.
#   stable -> /releases/latest  (GitHub already excludes prereleases)
#   beta   -> /releases and take the first one (so the newest release overall,
#             including pre-releases). We don't filter on prerelease==false so
#             the user actually gets the bleeding edge.
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

# Resolve the asset download URL for a given tag and architecture.
asset_url_for() {
	local tag="$1" arch="$2" want pattern
	want="${UPSTREAM_BIN_NAME}_${tag#v}_${arch}.tar.gz"
	# GitHub's API already returns full browser_download_url which is fine to
	# run through apply_prefix().
	pattern="$(echo "$want" | sed 's/[.]/\\./g')"
	api_get "https://api.github.com/repos/${UPSTREAM_REPO}/releases/tags/${tag}" \
		| sed -nE 's/.*"browser_download_url": *"([^"]+)".*/\1/p' \
		| grep -E "/${pattern}$" | head -1
}

# ---- local version -----------------------------------------------------------
local_version() {
	local binpath
	binpath="$(get_binpath)"
	[ -x "$binpath" ] || { echo ""; return 0; }
	"$binpath" version 2>/dev/null | tr -dc '0-9.'
}

# ---- main operations --------------------------------------------------------
op_check() {
	enter
	local local_v remote_v arch
	log "checking for updates..."

	arch="$(detect_arch)" || die "architecture not supported by upstream"
	log "resolved arch: $arch"

	remote_v="$(latest_release_tag)" || die "failed to fetch latest release tag"
	remote_v="${remote_v#v}"
	log "remote version: $remote_v"

	local_v="$(local_version)"
	log "local  version: ${local_v:-none}"

	# Compare purely numeric dotted versions.
	if [ -n "$local_v" ] && [ "$local_v" = "$remote_v" ]; then
		echo "uptodate $local_v $remote_v $arch"
		log "already up-to-date"
		cleanup 0
	fi

	if [ -z "$local_v" ]; then
		echo "missing $remote_v $arch"
		log "binary absent, download available"
		cleanup 1
	fi

	echo "outdated $local_v $remote_v $arch"
	log "update available"
	cleanup 1
}

install_asset() {
	# Args: <remote_tag> <arch>
	local tag="$1" arch="$2" url real_tar tmp_bin sum_expected sum_actual binpath data_dir
	url="$(asset_url_for "$tag" "$arch")"
	[ -z "$url" ] && die "no asset for tag=$tag arch=$arch"

	log "downloading $url"
	real_tar="$TMP_DIR/${UPSTREAM_BIN_NAME}_${arch}.tar.gz"
	curl -fsSL --connect-timeout 15 --max-time 300 \
		-o "$real_tar" "$(apply_prefix "$url")" 2>>"$LOG_FILE" \
		|| die "download failed"

	# sha256 from same repo's checksums.txt if present - cheap integrity check.
	sum_expected=$(
		curl -fsSL --connect-timeout 15 --max-time 30 \
			"$(apply_prefix "https://github.com/${UPSTREAM_REPO}/releases/download/${tag}/checksums.txt")" 2>/dev/null \
			| awk -v f="$(basename "$real_tar")" '$2 == f {print $1}'
	)
	if [ -n "$sum_expected" ]; then
		sum_actual=$(sha256sum "$real_tar" 2>/dev/null | awk '{print $1}')
		[ "$sum_actual" = "$sum_expected" ] || die "checksum mismatch (got ${sum_actual:0:12}... expected ${sum_expected:0:12}...)"
		log "checksum ok"
	else
		log "no upstream checksums published for $tag, skipping verification"
	fi

	log "extracting"
	tar -zxf "$real_tar" -C "$TMP_DIR" 2>>"$LOG_FILE" || die "extract failed"
	tmp_bin="$TMP_DIR/${UPSTREAM_BIN_NAME}"
	[ -f "$tmp_bin" ] || tmp_bin="$TMP_DIR/${tag}/${UPSTREAM_BIN_NAME}"
	[ -f "$tmp_bin" ] || die "binary not found in archive"

	binpath="$(get_binpath)"
	data_dir="$(get_data_dir)"

	# Stop service first so we can replace the in-use binary.
	/etc/init.d/memos stop >/dev/null 2>&1

	mkdir -p "${binpath%/*}" "${data_dir}" 2>/dev/null

	# Keep a backup so a failed move can roll back.
	if [ -x "$binpath" ]; then
		mv -f "$binpath" "${binpath}.old" 2>/dev/null
	fi

	log "installing to $binpath"
	if ! mv -f "$tmp_bin" "$binpath" 2>/dev/null; then
		[ -f "${binpath}.old" ] && mv -f "${binpath}.old" "$binpath" 2>/dev/null
		die "failed to install new binary"
	fi
	chmod 755 "$binpath" 2>/dev/null
	rm -f "${binpath}.old" 2>/dev/null

	# Restart the service if it was supposed to be enabled.
	if [ "$(uciget enabled)" = "1" ]; then
		log "starting service"
		/etc/init.d/memos start >/dev/null 2>&1 || log "service start after update returned non-zero"
	fi

	log "successfully installed ${UPSTREAM_BIN_NAME} ${tag#v}"
	echo "ok ${tag#v} $arch"
	cleanup 0
}

op_download() {
	# Force download regardless of local version. Used when the button reads
	# "Download" (binary missing).
	enter
	local remote_v arch
	arch="$(detect_arch)" || die "architecture not supported by upstream"
	remote_v="$(latest_release_tag)" || die "failed to fetch latest release tag"
	remote_v="${remote_v#v}"
	log "downloading latest ($remote_v) for $arch"
	install_asset "v${remote_v}" "$arch"
}

op_update() {
	# Only act when check says the remote is newer. Used when the button reads
	# "Update".
	enter
	local local_v remote_v arch
	arch="$(detect_arch)" || die "architecture not supported by upstream"

	remote_v="$(latest_release_tag)" || die "failed to fetch latest release tag"
	remote_v="${remote_v#v}"
	local_v="$(local_version)"

	if [ -n "$local_v" ] && [ "$local_v" = "$remote_v" ]; then
		log "no update needed (local=$local_v remote=$remote_v)"
		echo "uptodate $local_v $remote_v $arch"
		cleanup 0
	fi

	log "updating from ${local_v:-none} to $remote_v"
	install_asset "v${remote_v}" "$arch"
}

op_cancel() {
	if [ -f "$UPDATE_LOCK" ]; then
		pkill -f "/usr/share/memos/memos.sh" 2>/dev/null || true
		ipk_pid=""
		rm -f "$UPDATE_LOCK" 2>/dev/null
		[ -d "$TMP_DIR" ] && rm -rf "$TMP_DIR" 2>/dev/null
		log "cancelled by user"
		echo cancelled
		exit 0
	fi
	echo idle
}

# ---- entry ------------------------------------------------------------------
case "${1:-}" in
	check)    op_check ;;
	download) op_download ;;
	update)   op_update ;;
	cancel)   op_cancel ;;
	*)
		echo "usage: $0 {check|download|update|cancel}" >&2
		exit 2
		;;
esac
