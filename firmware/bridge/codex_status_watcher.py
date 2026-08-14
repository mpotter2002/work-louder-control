#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Mirror local Codex task state onto the Work Louder indicator lights."""

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
    ACTION_ERROR,
    ACTION_NOOP,
    ACTION_SUCCESS,
    CMD_SET_STATUS,
    SLOT_COUNT,
    STATUSES,
    WorkLouderBridge,
    build_packet,
    build_slot_packet,
    run_action,
)

COMPLETE_SECONDS = 8
ERROR_SECONDS = 12
ROLLOUT_LOOKBACK_HOURS = 48
FULL_SYNC_SECONDS = 2

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


def thread_status(state: ThreadState, now: float | None = None) -> str:
    current_time = time.time() if now is None else now
    if state.error_until > current_time:
        return "error"
    if state.needs_input:
        return "needs-input"
    if state.active:
        return "working"
    if state.complete_until > current_time:
        return "complete"
    return "idle"


def slot_statuses(states: list[ThreadState], now: float | None = None) -> list[str]:
    busiest = sorted(states, key=lambda state: state.last_event_at, reverse=True)
    return [
        thread_status(state, now) if state is not None else "idle"
        for state in (list(busiest) + [None] * SLOT_COUNT)[:SLOT_COUNT]
    ]


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
        self.thread_states: list[ThreadState] = []

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
        self.thread_states = list(self.states.values())
        return aggregate_status(self.thread_states)

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
    def __init__(self, push_repo: Path | None = None) -> None:
        self.last_sent: str | None = None
        self.last_slots: list[str] = ["none"] * SLOT_COUNT
        self.last_full_sync_at = float("-inf")
        self.push_repo = push_repo
        self.bridge: WorkLouderBridge | None = None

    def get_bridge(self) -> WorkLouderBridge:
        if self.bridge is None:
            self.bridge = WorkLouderBridge()
        return self.bridge

    def reset_bridge(self) -> None:
        if self.bridge is not None:
            self.bridge.close()
            self.bridge = None

    def publish(self, status: str, slots: list[str], run_actions: bool = False) -> bool:
        force_sync = time.monotonic() - self.last_full_sync_at >= FULL_SYNC_SECONDS
        if (
            status == self.last_sent
            and slots == self.last_slots
            and not run_actions
            and not force_sync
        ):
            return True

        bridge = self.get_bridge()
        status_changed = status != self.last_sent
        if status_changed or force_sync:
            response = bridge.send(
                build_packet(CMD_SET_STATUS, STATUSES[status], 0)
            )
            if response[7] != STATUSES[status]:
                raise RuntimeError(
                    f"Keyboard rejected status {status!r}: response={response[7]}"
                )
            self.last_sent = status
            if status_changed:
                logging.info("Codex status -> %s", status)

        for slot, slot_status in enumerate(slots):
            slot_changed = slot_status != self.last_slots[slot]
            if not slot_changed and not force_sync:
                continue
            response = bridge.send(
                build_slot_packet(slot, STATUSES[slot_status], 0)
            )
            if response[7] != STATUSES[slot_status]:
                raise RuntimeError(
                    f"Keyboard rejected thread {slot + 1} status "
                    f"{slot_status!r}: response={response[7]}"
                )
            self.last_slots[slot] = slot_status
            if slot_changed:
                logging.info("Codex thread %d -> %s", slot + 1, slot_status)

        if force_sync:
            self.last_full_sync_at = time.monotonic()

        if run_actions:
            for action in bridge.take_actions():
                logging.info("Work Louder action: %s", action)
                result = run_action(action, self.push_repo)
                if action == "push":
                    status_name = {
                        ACTION_SUCCESS: "complete",
                        ACTION_NOOP: "needs-input",
                        ACTION_ERROR: "error",
                    }[result]
                    ttl = 3 if result == ACTION_ERROR else 2
                    response = bridge.send(
                        build_packet(
                            CMD_SET_STATUS,
                            STATUSES[status_name],
                            ttl,
                        )
                    )
                    if response[7] != STATUSES[status_name]:
                        raise RuntimeError(
                            "Keyboard rejected Push confirmation"
                        )
                    self.last_full_sync_at = time.monotonic()

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
    parser.add_argument(
        "--run-actions",
        action="store_true",
        help="Carry out host actions such as launching Figma.",
    )
    parser.add_argument(
        "--push-repo",
        type=Path,
        help="Repository to push when the Push key is pressed.",
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
    publisher = StatusPublisher(args.push_repo)
    last_printed: str | None = None

    while True:
        status = monitor.refresh()
        slots = slot_statuses(monitor.thread_states)
        if args.dry_run:
            printable = f"{status} {slots}"
            if printable != last_printed:
                print(printable, flush=True)
                last_printed = printable
        else:
            try:
                publisher.publish("none", slots, args.run_actions)
            except Exception as error:
                publisher.reset_bridge()
                logging.warning("Could not update Work Louder status: %s", error)

        if args.once:
            return 0
        time.sleep(max(args.poll, 0.05))


if __name__ == "__main__":
    raise SystemExit(main())
