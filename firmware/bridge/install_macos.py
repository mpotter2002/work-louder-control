#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Install or remove the Work Louder Codex status LaunchAgent."""

from __future__ import annotations

import argparse
import os
import plistlib
import subprocess
import sys
from pathlib import Path

LABEL = "io.github.mpotter2002.work-louder-codex-status"


def launchctl(*arguments: str, check: bool = True) -> None:
    subprocess.run(
        ["launchctl", *arguments],
        check=check,
        stdout=subprocess.DEVNULL if not check else None,
        stderr=subprocess.DEVNULL if not check else None,
    )


def plist_path() -> Path:
    return Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"


def uninstall() -> None:
    domain = f"gui/{os.getuid()}"
    launchctl("bootout", f"{domain}/{LABEL}", check=False)
    path = plist_path()
    if path.exists():
        path.unlink()
    print(f"Removed {LABEL}")


def install(push_repo: Path | None = None) -> None:
    bridge_dir = Path(__file__).resolve().parent
    watcher = bridge_dir / "codex_status_watcher.py"
    codex_dir = Path.home() / ".codex"
    databases = sorted(
        codex_dir.glob("state_*.sqlite"),
        key=lambda candidate: candidate.stat().st_mtime,
        reverse=True,
    )
    database = databases[0] if databases else codex_dir / "state_5.sqlite"
    log_path = Path.home() / "Library" / "Logs" / "WorkLouderCodexStatus.log"
    path = plist_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    program_arguments = [
        sys.executable,
        str(watcher),
        "--database",
        str(database),
        "--run-actions",
    ]
    if push_repo is not None:
        program_arguments.extend(["--push-repo", str(push_repo.resolve())])

    payload = {
        "Label": LABEL,
        "ProgramArguments": program_arguments,
        "WorkingDirectory": str(bridge_dir),
        "RunAtLoad": True,
        "KeepAlive": True,
        "ThrottleInterval": 5,
        "EnvironmentVariables": {"HOME": str(Path.home())},
        "StandardOutPath": str(log_path),
        "StandardErrorPath": str(log_path),
    }
    with path.open("wb") as stream:
        plistlib.dump(payload, stream)

    domain = f"gui/{os.getuid()}"
    launchctl("bootout", f"{domain}/{LABEL}", check=False)
    launchctl("bootstrap", domain, str(path))
    print(f"Installed {LABEL}")
    print(f"Log: {log_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--uninstall", action="store_true")
    parser.add_argument(
        "--push-repo",
        type=Path,
        help="Repository to push when the keyboard Push key is pressed.",
    )
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("This installer supports macOS only.")
    if args.uninstall:
        uninstall()
    else:
        install(args.push_repo)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
