#!/usr/bin/env python3
"""
Auto-sync script for openwrt-packages-feed
同步上游仓库指定目录到本仓库，支持增量更新、错误重试、日志输出。
"""

import os
import sys
import json
import time
import subprocess
import base64
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# ============ 配置 ============
GH_TOKEN = os.environ.get("GH_TOKEN", "")
API_BASE = "https://api.github.com"

SOURCES = [
    {
        "source_repo": "Jonnyan404/cloud-clipboard-go",
        "source_path": "openwrt/luci-app-cloud-clipboard",
        "target": "luci-app-cloud-clipboard/",
    },
    {
        "source_repo": "Openwrt-Passwall/openwrt-passwall",
        "source_path": "luci-app-passwall",
        "target": "luci-app-passwall/",
    },
]

API_TIMEOUT = 30
MAX_RETRIES = 3
RETRY_DELAY = 5

# ============ 日志 ============
log_lines = []


def log(msg: str):
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    log_lines.append(line)


def flush_log():
    with open("sync.log", "w") as f:
        f.write("\n".join(log_lines) + "\n")


# ============ HTTP 工具 ============
class APIError(Exception):
    pass


def api_get(url: str, raw: bool = False):
    """GET GitHub API with retry, return JSON or raw bytes."""
    headers = {
        "Authorization": f"token {GH_TOKEN}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "auto-sync-bot",
    }
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = Request(url, headers=headers)
            resp = urlopen(req, timeout=API_TIMEOUT)
            if raw:
                return resp.read()
            return json.loads(resp.read())
        except HTTPError as e:
            if e.code == 404:
                raise APIError(f"404 Not Found: {url}")
            if e.code == 403:
                remaining = e.headers.get("X-RateLimit-Remaining", "?")
                reset_ts = e.headers.get("X-RateLimit-Reset", "?")
                if remaining == "0":
                    wait = max(int(reset_ts) - int(time.time()), 1) if reset_ts != "?" else 60
                    wait = min(wait, 300)
                    log(f"⚠️ 速率限制，等待 {wait}s (attempt {attempt}/{MAX_RETRIES})")
                    time.sleep(wait)
                    last_err = e
                    continue
            last_err = e
            log(f"⚠️ HTTP {e.code} (attempt {attempt}/{MAX_RETRIES}): {url}")
            time.sleep(RETRY_DELAY * attempt)
        except URLError as e:
            last_err = e
            log(f"⚠️ 网络错误 (attempt {attempt}/{MAX_RETRIES}): {e.reason}")
            time.sleep(RETRY_DELAY * attempt)
    raise APIError(f"API 调用失败 ({MAX_RETRIES} 次重试后): {url} | {last_err}")


def get_default_branch(repo: str) -> str:
    """通过 /repos/{repo} 获取默认分支名。"""
    data = api_get(f"{API_BASE}/repos/{repo}")
    branch = data.get("default_branch", "main")
    log(f"  {repo} 默认分支: {branch}")
    return branch


def fetch_tree(repo: str, branch: str, source_path: str) -> list:
    """
    获取仓库递归 tree，返回 source_path 下的所有 blob 条目。
    处理 truncated 的情况。
    """
    tree_data = api_get(f"{API_BASE}/repos/{repo}/git/trees/{branch}?recursive=1")

    if tree_data.get("truncated"):
        log(f"  ⚠️ tree 被截断，回退到 contents API 逐目录获取: {source_path}")
        return _fetch_via_contents(repo, branch, source_path)

    entries = tree_data.get("tree", [])
    prefix = source_path.rstrip("/") + "/"
    result = [e for e in entries if e["type"] == "blob" and e["path"].startswith(prefix)]
    log(f"  {source_path}: {len(result)} 个文件")
    return result


def _fetch_via_contents(repo: str, branch: str, path: str) -> list:
    """tree 截断时的回退方案，递归遍历 contents API。"""
    entries = []

    def _recurse(sub_path: str):
        data = api_get(f"{API_BASE}/repos/{repo}/contents/{sub_path}?ref={branch}")
        if isinstance(data, dict):
            data = [data]
        for item in data:
            if item["type"] == "file":
                entries.append({
                    "path": item["path"],
                    "sha": item["sha"],
                    "size": item.get("size", 0),
                })
            elif item["type"] == "dir":
                _recurse(item["path"])

    _recurse(path)
    log(f"  {path}: {len(entries)} 个文件 (via contents API)")
    return entries


# ============ Git 工具 ============
def get_local_blob_shas() -> dict:
    """
    获取本地所有 tracked 文件的 git blob SHA。
    返回 {filepath: blob_sha}。
    """
    result = subprocess.run(
        ["git", "ls-files", "-s"],
        capture_output=True, text=True, cwd="."
    )
    shas = {}
    for line in result.stdout.strip().split("\n"):
        if not line:
            continue
        parts = line.split("\t", 1)
        if len(parts) != 2:
            continue
        meta, path = parts
        sha = meta.split()[1]
        shas[path] = sha
    return shas


def git_rm_file(filepath: str):
    """安全删除文件。"""
    try:
        subprocess.run(["git", "rm", "--quiet", "--", filepath],
                       capture_output=True, timeout=10)
    except Exception:
        pass
    full_path = os.path.join(".", filepath)
    if os.path.exists(full_path):
        try:
            os.remove(full_path)
        except OSError:
            pass


# ============ 同步主流程 ============
def sync_target(src: dict, local_shas: dict) -> tuple:
    """同步单个源。返回 (added, updated, deleted, errors)。"""
    repo = src["source_repo"]
    source_path = src["source_path"]
    target = src["target"]

    log(f"━━━ 同步: {repo}/{source_path} → {target} ━━━")

    # 1. 获取默认分支
    branch = get_default_branch(repo)

    # 2. 获取源文件树
    remote_entries = fetch_tree(repo, branch, source_path)
    if not remote_entries:
        log(f"  ⚠️ 未找到源文件，跳过")
        return 0, 0, 0, 0

    # 3. 构建远程→本地路径映射
    remote_local_map = {}  # local_path → entry
    for entry in remote_entries:
        rel_path = entry["path"][len(source_path):].lstrip("/")
        if target.endswith("/"):
            local_path = target + rel_path
        else:
            local_path = target + "/" + rel_path if rel_path else target
        remote_local_map[local_path] = entry

    # 4. 下载并写入文件（用 git blob SHA 做幂等判断）
    added = updated = errors = 0
    for local_path, entry in remote_local_map.items():
        remote_sha = entry["sha"]
        local_sha = local_shas.get(local_path)

        if local_sha == remote_sha and local_sha is not None:
            continue

        try:
            blob_url = f"{API_BASE}/repos/{repo}/git/blobs/{remote_sha}"
            blob_data = api_get(blob_url)
            content = blob_data.get("content", "")
            encoding = blob_data.get("encoding", "base64")
            if encoding == "base64":
                file_bytes = base64.b64decode(content)
            else:
                file_bytes = content.encode("utf-8")

            dir_path = os.path.dirname(local_path)
            if dir_path:
                os.makedirs(dir_path, exist_ok=True)

            with open(local_path, "wb") as f:
                f.write(file_bytes)

            if local_sha is None:
                added += 1
                log(f"  + 新增: {local_path}")
            else:
                updated += 1
                log(f"  ~ 更新: {local_path}")
        except Exception as e:
            errors += 1
            log(f"  ❌ 下载失败: {entry['path']} → {e}")

    # 5. 清理目标目录中不再存在于源的文件
    deleted = 0
    protected = {".github", ".git", ".gitignore", "sync.py", "sync.log",
                 "README.md", "LICENSE"}

    target_dir = target.rstrip("/")
    result = subprocess.run(
        ["git", "ls-files", target_dir],
        capture_output=True, text=True
    )
    existing_files = set()
    for line in result.stdout.strip().split("\n"):
        if line.strip():
            existing_files.add(line.strip())

    for f in existing_files:
        if f not in remote_local_map:
            top = f.split("/")[0] if "/" in f else f
            if top in protected:
                continue
            git_rm_file(f)
            deleted += 1
            log(f"  - 删除: {f}")

    log(f"  小计: +{added} ~{updated} -{deleted} 错误:{errors}")
    return added, updated, deleted, errors


def main():
    log("=" * 60)
    log("Auto-sync 启动")
    log(f"源仓库数: {len(SOURCES)}")

    if not GH_TOKEN:
        log("❌ GH_TOKEN 未设置")
        flush_log()
        sys.exit(1)

    total_added = total_updated = total_deleted = total_errors = 0

    try:
        local_shas = get_local_blob_shas()
        log(f"本地 tracked 文件: {len(local_shas)} 个")

        for src in SOURCES:
            a, u, d, e = sync_target(src, local_shas)
            total_added += a
            total_updated += u
            total_deleted += d
            total_errors += e

        log("")
        log(f"━━━ 汇总 ━━━")
        log(f"  新增: {total_added}")
        log(f"  更新: {total_updated}")
        log(f"  删除: {total_deleted}")
        log(f"  错误: {total_errors}")

        if total_errors > 0:
            log("⚠️ 存在错误，退出码 1")
            flush_log()
            sys.exit(1)

    except APIError as e:
        log(f"❌ 致命错误: {e}")
        flush_log()
        sys.exit(1)
    except Exception as e:
        log(f"❌ 未预期错误: {e}")
        flush_log()
        sys.exit(1)

    if total_added == 0 and total_updated == 0 and total_deleted == 0:
        log("✅ 所有文件已是最新")

    flush_log()


if __name__ == "__main__":
    main()
