# Codex Status Bridge

The bridge sends `WL` Raw HID status packets and can listen for semantic button
and encoder events.

## Setup

```bash
cd firmware/bridge
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Test the connected board:

```bash
.venv/bin/python work_louder_bridge.py list
.venv/bin/python work_louder_bridge.py ping
.venv/bin/python work_louder_bridge.py status working
.venv/bin/python work_louder_bridge.py listen
```

## Automatic Codex Status on macOS

Install the per-user LaunchAgent:

```bash
.venv/bin/python install_macos.py --push-repo /path/to/work-louder-control
```

The installer uses the current virtual environment and repository path. It
does not require `sudo`. When `--push-repo` is configured, the hardware Push
key runs `git push` for that repository.

Uninstall:

```bash
.venv/bin/python install_macos.py --uninstall
```

The watcher reads local Codex task metadata and session JSONL files. These are
not a stable public API, so future Codex releases may require parser updates.
