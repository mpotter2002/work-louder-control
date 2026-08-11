#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Mirror local Codex task state onto the Work Louder status light."""

from __future__ import annotations

import argparse
import json
import logging
import re
import sqlite3
import time
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from work_louder_bridge import (
    CMD_SET_STATUS,
    STATUSES,
    WorkLouderBridge,
    build_packet,
)

COMPLETE_SECONDS = 8
ERROR_SECONDS = 12
ROLLOUT_LOOKBACK_HOURS = 48

INPUT_PATTERNS = (
    re.compile(r"\?$"),
    re.compile(r"\bplease (?:press|choose|confirm|reply|enter|select|send|provide)\b"),
    re.compile(r"\b(?:tell|let) me know\b"),
    re.compile(r"\bi need you to\b"),
    re.compile(r"\breply with\b"),
    re.compile(r"\bwhen you(?:'re| are) ready\b"),
)

WORK_ACTIVITY = {
    "agent_reasoning",
    "mcp_tool_call_end",
    "patch_apply_end",
    "web_search_end",
}


def default_database() -> Path:
    codex_dir = Path.home() / ".codex"
    candidates = sorted(
        codex_dir.glob("state_*.sqlite"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    return candidates[0] if candidates else codex_dir / "state_5.sqlite"


def parse_timestamp(value: str | None) -> float:
    if not value:
        return time.time()
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def requests_input(message: str | None) -> bool:
    if not message:
        return False
    normalized = " ".join(message.strip().lower().split())
    return any(pattern.search(normalized) for pattern in INPUT_PATTERNS)


@dataclass
class ThreadState:
    active: bool = False
    needs_input: bool = False
    complete_until: float = 0
    error_until: float = 0
    last_event_at: float = 0

    def apply(self, event: dict) -> None:
        if event.get("type") != "event_msg":
            return

        payload = event.get("payload") or {}
        event_type = payload.get("type")
        occurred_at = parse_timestamp(event.get("timestamp"))
        self.last_event_at = max(self.last_event_at, occurred_at)

        if event_type == "task_started":
            self.active = True
            self.needs_input = False
            self.complete_until = 0
            self.error_until = 0
        elif event_type == "user_message":
            self.needs_input = False
        elif event_type == "agent_message":
            self.needs_input = requests_input(payload.get("message"))
        elif event_type in WORK_ACTIVITY and self.active:
            self.needs_input = False
        elif event_type == "task_complete":
            self.active = False
            message = payload.get("last_agent_message")
            self.needs_input = requests_input(message)
            if not self.needs_input:
                self.complete_until = occurred_at + COMPLETE_SECONDS
        elif event_type == "turn_aborted":
            self.active = False
            self.needs_input = False
            if payload.get("reason") != "interrupted":
                self.error_until = occurred_at + ERROR_SECONDS


def aggregate_status(states: list[ThreadState], now: float | None = None) -> str:
    current_time = time.time() if now is None else now
    if any(state.error_until > current_time for state in states):
        return "error"
    if any(state.needs_input for state in states):
        return "needs-input"
    if any(state.active for state in states):
        return "working"
    if any(state.complete_until > current_time for state in states):
        return "complete"
    return "idle"


class RolloutMonitor:
    def __init__(self, database: Path) -> None:
        self.database = database
        self.states: dict[Path, ThreadState] = {}
        self.offsets: dict[Path, int] = {}
        self.last_discovery_at = 0.0
        self.last_database_warning_at = 0.0

    def recent_rollouts(self) -> list[Path]:
        cutoff_ms = int(
            (time.time() - ROLLOUT_LOOKBACK_HOURS * 60 * 60) * 1000
        )
        uri = f"file:{self.database}?mode=ro"
        with closing(
            sqlite3.connect(uri, uri=True, timeout=1)
        ) as connection:
            rows = connection.execute(
                """
                SELECT rollout_path
                FROM threads
                WHERE archived = 0 AND updated_at_ms >= ?
                ORDER BY updated_at_ms DESC
                """,
                (cutoff_ms,),
            )
            return [Path(row[0]) for row in rows if row[0]]

    def filesystem_rollouts(self) -> list[Path]:
        cutoff = time.time() - ROLLOUT_LOOKBACK_HOURS * 60 * 60
        sessions = self.database.parent / "sessions"
        paths = []
        try:
            candidates = sessions.rglob("*.jsonl")
            for path in candidates:
                try:
                    if path.stat().st_mtime >= cutoff:
                        paths.append(path)
                except OSError:
                    continue
        except OSError:
            return list(self.states)
        return sorted(paths)

    def discover_rollouts(self) -> list[Path]:
        try:
            return self.recent_rollouts()
        except (OSError, sqlite3.Error) as error:
            now = time.time()
            if now - self.last_database_warning_at >= 30:
                logging.warning(
                    "Codex task index unavailable; using session files: %s",
                    error,
                )
                self.last_database_warning_at = now
            return self.filesystem_rollouts()

    def refresh(self) -> str:
        now = time.time()
        if not self.states or now - self.last_discovery_at >= 2:
            paths = self.discover_rollouts()
            self.last_discovery_at = now
        else:
            paths = list(self.states)

        for path in paths:
            self._read_new_events(path)

        active_paths = set(paths)
        self.states = {
            path: state
            for path, state in self.states.items()
            if path in active_paths
        }
        self.offsets = {
            path: offset
            for path, offset in self.offsets.items()
            if path in active_paths
        }
        return aggregate_status(list(self.states.values()))

    def _read_new_events(self, path: Path) -> None:
        try:
            size = path.stat().st_size
        except OSError:
            return

        offset = self.offsets.get(path, 0)
        if size < offset:
            offset = 0

        state = self.states.setdefault(path, ThreadState())
        try:
            with path.open("r", encoding="utf-8") as stream:
                stream.seek(offset)
                for line in stream:
                    try:
                        state.apply(json.loads(line))
                    except (json.JSONDecodeError, TypeError, ValueError):
                        logging.debug("Skipped incomplete rollout event in %s", path)
                self.offsets[path] = stream.tell()
        except OSError as error:
            logging.debug("Could not read %s: %s", path, error)


class StatusPublisher:
    def __init__(self) -> None:
        self.last_sent: str | None = None

    def publish(self, status: str) -> bool:
        if status == self.last_sent:
            return True

        bridge = WorkLouderBridge()
        try:
            response = bridge.send(
                build_packet(CMD_SET_STATUS, STATUSES[status], 0)
            )
        finally:
            bridge.close()

        if response[7] != STATUSES[status]:
            raise RuntimeError(
                f"Keyboard rejected status {status!r}: response={response[7]}"
            )

        self.last_sent = status
        logging.info("Codex status -> %s", status)
        return True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=default_database())
    parser.add_argument("--poll", type=float, default=0.25)
    parser.add_argument(
        "--once",
        action="store_true",
        help="Read current state, publish once, and exit.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print state changes without opening the keyboard.",
    )
    parser.add_argument("--verbose", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    monitor = RolloutMonitor(args.database)
    publisher = StatusPublisher()
    last_printed: str | None = None

    while True:
        status = monitor.refresh()
        if args.dry_run:
            if status != last_printed:
                print(status, flush=True)
                last_printed = status
        else:
            try:
                publisher.publish(status)
            except Exception as error:
                logging.warning("Could not update Work Louder status: %s", error)

        if args.once:
            return 0
        time.sleep(max(args.poll, 0.05))


if __name__ == "__main__":
    raise SystemExit(main())
