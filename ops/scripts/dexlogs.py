#!/usr/bin/env python3
"""
Stream Dexter logs (API, FE, MCP) in a single chronological feed.
"""
from __future__ import annotations

import argparse
import asyncio
import contextlib
import datetime as dt
import heapq
import json
import os
import re
import signal
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import timezone
from pathlib import Path
from typing import Iterable, List, Optional, Tuple
from zoneinfo import ZoneInfo

TARGET_PM2_NAMES = ["dexter-api", "dexter-fe", "dexter-mcp"]
TIMESTAMP_RE = re.compile(r"^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})([.,]\d{1,6})?")
NGINX_TIMESTAMP_RE = re.compile(r"\[(\d{2}/[A-Za-z]{3}/\d{4}:\d{2}:\d{2}:\d{2}) ([+-]\d{4})\]")
LOCAL_TZ = ZoneInfo("America/New_York")
DEFAULT_FLUSH_DELAY = 1.0  # seconds


class LogError(RuntimeError):
    pass


class OutputClosed(RuntimeError):
    """Raised when downstream output is closed (e.g., piped through head)."""


COLOR_RESET = "\033[0m"
COLOR_DIM = "\033[2m"
COLOR_BOLD = "\033[1m"

SERVICE_COLORS = {
    "dexter-api": "\033[38;5;46m",
    "dexter-fe": "\033[38;5;33m",
    "dexter-mcp": "\033[38;5;135m",
    "nginx": "\033[38;5;244m",
}

SEVERITY_COLORS = {
    "error": "\033[38;5;196m\033[1m",
    "warn": "\033[38;5;214m\033[1m",
    "info": "",
}

SINCE_UNIT_SECONDS = {
    "s": 1,
    "m": 60,
    "h": 3600,
    "d": 86400,
}


def color_enabled(mode: str) -> bool:
    if mode == "always":
        return True
    if mode == "never":
        return False
    # auto
    return sys.stdout.isatty()


def colorize(text: str, code: str, enabled: bool) -> str:
    if not enabled or not code:
        return text
    return f"{code}{text}{COLOR_RESET}"


def classify_severity(entry: LogEntry) -> str:
    source = entry.source
    text = entry.text.lower()
    if source.endswith("/err"):
        return "error"
    error_tokens = ("error", "failed", "exception", "panic", "fatal", "denied", "invalid")
    warn_tokens = ("warn", "warning", "timeout", "retry", "slow")
    if any(token in text for token in error_tokens):
        return "error"
    if any(token in text for token in warn_tokens):
        return "warn"
    return "info"


def format_entry(entry: LogEntry, use_color: bool) -> str:
    severity = classify_severity(entry)
    service = entry.source.split("/", 1)[0]
    utc_dt = entry.sort_key.replace(tzinfo=timezone.utc)
    local_dt = utc_dt.astimezone(LOCAL_TZ)
    ts = local_dt.strftime("%Y-%m-%d %I:%M:%S %p %Z")

    ts_part = colorize(ts, COLOR_DIM, use_color)
    source_color = SERVICE_COLORS.get(service, COLOR_BOLD)
    source_text = colorize(entry.source, source_color, use_color)
    message_color = SEVERITY_COLORS.get(severity, "")
    message_text = colorize(entry.text, message_color, use_color)

    return f"{ts_part} [{source_text}] {message_text}"


def parse_since_spec(spec: str) -> Tuple[Optional[dt.datetime], str]:
    spec_normalized = spec.strip().lower()
    if spec_normalized in {"all", "any", "everything", "infinite", "inf"}:
        return None, "all available logs"

    match = re.fullmatch(r"(\d+)([smhd]?)", spec_normalized)
    if not match:
        raise ValueError("use formats like '30m', '2h', '1d', or 'all'")

    value = int(match.group(1))
    unit = match.group(2) or "h"
    if value == 0:
        return None, "all available logs"

    seconds = value * SINCE_UNIT_SECONDS[unit]
    since_dt = utc_now() - dt.timedelta(seconds=seconds)
    label = f"last {value}{unit}"
    return since_dt, label


def utc_now() -> dt.datetime:
    """Return a timezone-naive UTC timestamp."""
    return dt.datetime.now(timezone.utc).replace(tzinfo=None)


@dataclass(order=True)
class LogEntry:
    sort_key: dt.datetime = field(compare=True)
    seq: int = field(compare=True)
    source: str = field(compare=False)
    text: str = field(compare=False)


@dataclass
class LogSource:
    name: str
    kind: str
    path: Path
    last_ts: Optional[dt.datetime] = None
    seq: int = 0

    def label(self) -> str:
        return f"{self.name}/{self.kind}"

    def next_seq(self) -> int:
        self.seq += 1
        return self.seq


def parse_timestamp(line: str) -> Optional[dt.datetime]:
    match = TIMESTAMP_RE.match(line)
    if match:
        base = match.group(1).replace("T", " ")
        fractional = match.group(2)
        try:
            ts = dt.datetime.strptime(base, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            ts = None
        if ts is not None:
            if fractional:
                fractional_digits = fractional[1:]
                micro = int(fractional_digits.ljust(6, "0")[:6])
                ts = ts.replace(microsecond=micro)
            return ts

    # nginx access/error logs embed the actual request time in brackets.
    match = NGINX_TIMESTAMP_RE.search(line)
    if match:
        raw = f"{match.group(1)} {match.group(2)}"
        try:
            ts = dt.datetime.strptime(raw, "%d/%b/%Y:%H:%M:%S %z")
        except ValueError:
            ts = None
        if ts is not None:
            return ts.astimezone(timezone.utc).replace(tzinfo=None)

    return None


def pm2_logs(names: Iterable[str]) -> List[LogSource]:
    try:
        result = subprocess.run(
            ["pm2", "jlist"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        raise LogError(f"Unable to run pm2 jlist: {exc}") from exc

    try:
        raw = json.loads(result.stdout or "[]")
    except json.JSONDecodeError as exc:
        raise LogError("Failed to parse pm2 jlist output") from exc

    sources: List[LogSource] = []
    seen_paths: set[Path] = set()

    for proc in raw:
        name = proc.get("name")
        if name not in names:
            continue
        env = proc.get("pm2_env", {})
        out_path = env.get("pm_out_log_path")
        err_path = env.get("pm_err_log_path")
        for kind, log_path in ("out", out_path), ("err", err_path):
            if not log_path:
                continue
            path = Path(log_path).expanduser()
            if path in seen_paths:
                continue
            seen_paths.add(path)
            sources.append(LogSource(name=name, kind=kind, path=path))

    return sources


def detect_nginx_logs() -> List[LogSource]:
    base = Path("/var/log/nginx")
    if not base.is_dir():
        return []
    candidates = [
        "dexter-access.log",
        "dexter-error.log",
        "dexter-ws-access.log",
        "dexter-ws-error.log",
        "dexter.log",
        "dexter.access.log",
        "dexter.error.log",
    ]
    sources: List[LogSource] = []
    for name in candidates:
        path = base / name
        if path.exists():
            sources.append(LogSource(name="nginx", kind=name, path=path))
    return sources


async def stream_source(
    source: LogSource,
    queue: "asyncio.Queue[Optional[LogEntry]]",
    follow: bool,
    since: Optional[dt.datetime],
):
    if not source.path.exists():
        await queue.put(
            LogEntry(
                sort_key=utc_now(),
                seq=source.next_seq(),
                source=source.label(),
                text=f"[dexlogs] missing log file: {source.path}",
            )
        )
        await queue.put(None)
        return

    if source.path.is_dir():
        await queue.put(
            LogEntry(
                sort_key=utc_now(),
                seq=source.next_seq(),
                source=source.label(),
                text=f"[dexlogs] {source.path} is a directory, skipping",
            )
        )
        await queue.put(None)
        return

    tail_cmd = ["tail", "-n", "+1"]
    if follow:
        tail_cmd.extend(["-F", str(source.path)])
    else:
        tail_cmd.append(str(source.path))

    exec_cmd = tail_cmd
    if not os.access(source.path, os.R_OK):
        exec_cmd = ["sudo", "-n", *tail_cmd]

    try:
        proc = await asyncio.create_subprocess_exec(
            *exec_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        await queue.put(
            LogEntry(
                sort_key=utc_now(),
                seq=source.next_seq(),
                source=source.label(),
                text=f"[dexlogs] tail not available: {exc}",
            )
        )
        await queue.put(None)
        return

    # Establish default timestamp from file mtime.
    try:
        mtime = source.path.stat().st_mtime
        source.last_ts = dt.datetime.fromtimestamp(mtime, tz=timezone.utc).replace(tzinfo=None)
    except OSError:
        source.last_ts = utc_now()

    try:
        assert proc.stdout is not None
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            text = line.decode(errors="replace").rstrip("\n")
            raw_ts = parse_timestamp(text)
            if raw_ts is None:
                if source.last_ts is None:
                    approx_ts = utc_now()
                else:
                    approx_ts = source.last_ts + dt.timedelta(microseconds=1)
            else:
                approx_ts = raw_ts

            source.last_ts = approx_ts

            if since is not None and approx_ts < since:
                continue

            entry = LogEntry(
                sort_key=approx_ts,
                seq=source.next_seq(),
                source=source.label(),
                text=text,
            )
            await queue.put(entry)
    finally:
        if follow:
            try:
                await proc.wait()
            except Exception:
                pass
        else:
            if proc.returncode is None:
                proc.terminate()
                try:
                    await proc.wait()
                except Exception:
                    pass

        stderr_text = ""
        if proc.stderr is not None:
            try:
                stderr_bytes = await proc.stderr.read()
                stderr_text = stderr_bytes.decode(errors="replace").strip()
            except Exception:
                stderr_text = ""

        if proc.returncode not in (0, None):
            message = stderr_text or f"tail exited with code {proc.returncode}"
            await queue.put(
                LogEntry(
                    sort_key=utc_now(),
                    seq=source.next_seq(),
                    source=source.label(),
                    text=f"[dexlogs] failed to read {source.path}: {message}",
                )
            )

        await queue.put(None)


async def drain_queue(
    queue: "asyncio.Queue[Optional[LogEntry]]",
    total_sources: int,
    flush_delay: float,
    use_color: bool,
):
    pending = total_sources
    heap: List[Tuple[dt.datetime, int, LogEntry]] = []

    async def flush(force: bool = False):
        now = utc_now()
        threshold = now - dt.timedelta(seconds=flush_delay)
        while heap:
            if not force and heap[0][0] > threshold:
                break
            _, _, entry = heapq.heappop(heap)
            formatted = format_entry(entry, use_color)
            try:
                print(formatted, flush=True)
            except BrokenPipeError as exc:
                raise OutputClosed from exc

    try:
        while pending > 0 or heap:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=0.2)
            except asyncio.TimeoutError:
                item = "__tick__"

            if item is None:
                pending -= 1
            elif item == "__tick__":
                pass
            else:
                entry = item
                heapq.heappush(heap, (entry.sort_key, entry.seq, entry))

            await flush(force=False)
    except asyncio.CancelledError:
        pass
    except OutputClosed:
        return
    finally:
        with contextlib.suppress(OutputClosed):
            await flush(force=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Stream merged Dexter logs (API, FE, MCP, optional Nginx).",
    )
    parser.add_argument(
        "--no-follow",
        action="store_true",
        help="Print current logs and exit instead of following.",
    )
    parser.add_argument(
        "--no-nginx",
        action="store_true",
        help="Skip Nginx logs (included by default when readable).",
    )
    parser.add_argument(
        "--flush-delay",
        type=float,
        default=DEFAULT_FLUSH_DELAY,
        help="Seconds to buffer lines to maintain chronological order (default: 1.0).",
    )
    parser.add_argument(
        "--since",
        type=str,
        default="1h",
        help="How far back to include logs (e.g. 30m, 2h, 1d, all). Default: 1h.",
    )
    parser.add_argument(
        "--paths",
        action="store_true",
        help="List the log files being tailed and exit.",
    )
    parser.add_argument(
        "--color",
        choices=["auto", "always", "never"],
        default="auto",
        help="Colorize output: auto (default), always, or never.",
    )
    return parser


async def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    # Ensure pipes close quietly when output is truncated (e.g., piped to head).
    with contextlib.suppress(ValueError):
        signal.signal(signal.SIGPIPE, signal.SIG_DFL)

    try:
        sources = pm2_logs(TARGET_PM2_NAMES)
    except LogError as exc:
        print(f"dexlogs: {exc}", file=sys.stderr)
        return 1

    nginx_sources: List[LogSource] = []
    if not args.no_nginx:
        nginx_sources = detect_nginx_logs()
        sources.extend(nginx_sources)

    if not sources:
        print("dexlogs: no log sources found", file=sys.stderr)
        return 1

    if args.paths:
        for src in sources:
            print(f"{src.label():<24} {src.path}")
        return 0

    follow = not args.no_follow
    use_color = color_enabled(args.color)

    try:
        since_cutoff, since_label = parse_since_spec(args.since)
    except ValueError as exc:
        print(f"dexlogs: invalid --since value '{args.since}': {exc}", file=sys.stderr)
        return 1

    if since_cutoff is None:
        header_line = "dexlogs: showing all available logs"
    else:
        since_local = since_cutoff.replace(tzinfo=timezone.utc).astimezone(LOCAL_TZ)
        since_str = since_local.strftime("%Y-%m-%d %I:%M:%S %p %Z")
        header_line = f"dexlogs: showing logs since {since_str} ({since_label})"

    print(colorize(header_line, COLOR_BOLD, use_color), flush=True)
    if not args.no_nginx and not nginx_sources:
        hint = "dexlogs: nginx logs not found or not readable"
        print(colorize(hint, COLOR_DIM, use_color), flush=True)
    queue: "asyncio.Queue[Optional[LogEntry]]" = asyncio.Queue(maxsize=2048)

    reader_tasks = [
        asyncio.create_task(
            stream_source(src, queue, follow=follow, since=since_cutoff)
        )
        for src in sources
    ]

    drain_task = asyncio.create_task(
        drain_queue(
            queue,
            total_sources=len(reader_tasks),
            flush_delay=args.flush_delay,
            use_color=use_color,
        )
    )

    # Handle Ctrl-C gracefully.
    loop = asyncio.get_running_loop()

    stop_event = asyncio.Event()

    def _handle_sigint():
        stop_event.set()

    loop.add_signal_handler(signal.SIGINT, _handle_sigint)
    loop.add_signal_handler(signal.SIGTERM, _handle_sigint)

    try:
        stop_task = asyncio.create_task(stop_event.wait())
        done, pending = await asyncio.wait(
            [drain_task, stop_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
    finally:
        for task in reader_tasks:
            task.cancel()
        await asyncio.gather(*reader_tasks, return_exceptions=True)
        if not drain_task.done():
            drain_task.cancel()
            with contextlib.suppress(Exception):
                await drain_task

    return 0


if __name__ == "__main__":
    import contextlib

    try:
        exit_code = asyncio.run(main())
    except KeyboardInterrupt:
        exit_code = 130
    sys.exit(exit_code)
