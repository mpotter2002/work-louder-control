#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-or-later
"""Control and inspect the Work Louder Codex firmware over VIA Raw HID."""

from __future__ import annotations

import argparse
import sys
import time

import hid

VID = 0x574C
PID = 0xE6E3
RAW_USAGE_PAGE = 0xFF60
RAW_USAGE = 0x61
REPORT_SIZE = 32

PROTOCOL_ID = 0xFE
SIGNATURE = b"WL"
PROTOCOL_VERSION = 0x01

CMD_SET_STATUS = 0x01
CMD_PING = 0x02
CMD_ACTION = 0x80

STATUSES = {
    "none": 0,
    "idle": 1,
    "working": 2,
    "needs-input": 3,
    "complete": 4,
    "error": 5,
}
STATUS_NAMES = {value: name for name, value in STATUSES.items()}

ACTIONS = {
    1: "push",
    2: "effort-down",
    3: "effort-up",
}


def raw_interfaces() -> list[dict]:
    return [
        device
        for device in hid.enumerate(VID, PID)
        if device.get("usage_page") == RAW_USAGE_PAGE
        and device.get("usage") == RAW_USAGE
    ]


def build_packet(command: int, value: int = 0, ttl: int = 0) -> bytes:
    packet = bytearray(REPORT_SIZE)
    packet[0] = PROTOCOL_ID
    packet[1:3] = SIGNATURE
    packet[3] = PROTOCOL_VERSION
    packet[4] = command
    packet[5] = value
    packet[6] = ttl
    return bytes(packet)


def is_protocol_packet(packet: bytes) -> bool:
    return (
        len(packet) >= 6
        and packet[0] == PROTOCOL_ID
        and packet[1:3] == SIGNATURE
        and packet[3] == PROTOCOL_VERSION
    )


class WorkLouderBridge:
    def __init__(self) -> None:
        interfaces = raw_interfaces()
        if not interfaces:
            raise RuntimeError(
                "Work Louder Micro Pad Raw HID interface was not found."
            )
        self.device = hid.Device(path=interfaces[0]["path"])

    def close(self) -> None:
        self.device.close()

    def send(self, packet: bytes, timeout_ms: int = 1000) -> bytes:
        if len(packet) != REPORT_SIZE:
            raise ValueError(f"Reports must be exactly {REPORT_SIZE} bytes.")

        written = self.device.write(b"\0" + packet)
        if written <= 0:
            raise RuntimeError("Raw HID write failed.")

        deadline = time.monotonic() + timeout_ms / 1000
        while time.monotonic() < deadline:
            response = bytes(self.device.read(REPORT_SIZE, 50))
            if response and is_protocol_packet(response):
                return response
        raise TimeoutError("The keyboard did not return a protocol response.")

    def read(self, timeout_ms: int = 250) -> bytes:
        return bytes(self.device.read(REPORT_SIZE, timeout_ms))


def command_list() -> int:
    interfaces = raw_interfaces()
    if not interfaces:
        print("No Work Louder Raw HID interface found.")
        return 1

    for device in interfaces:
        print(
            f"{device.get('product_string', 'Micro Pad')} "
            f"VID:PID={VID:04x}:{PID:04x} "
            f"usage={RAW_USAGE_PAGE:04x}:{RAW_USAGE:02x} "
            f"interface={device.get('interface_number')}"
        )
    return 0


def command_status(name: str, ttl: int) -> int:
    bridge = WorkLouderBridge()
    try:
        response = bridge.send(build_packet(CMD_SET_STATUS, STATUSES[name], ttl))
    finally:
        bridge.close()

    accepted = STATUS_NAMES.get(response[7], f"unknown-{response[7]}")
    print(f"Status accepted: {accepted}")
    return 0


def command_ping() -> int:
    bridge = WorkLouderBridge()
    try:
        response = bridge.send(build_packet(CMD_PING))
    finally:
        bridge.close()

    current = STATUS_NAMES.get(response[5], f"unknown-{response[5]}")
    print(f"Firmware protocol v{response[3]}, status: {current}")
    return 0


def command_listen() -> int:
    bridge = WorkLouderBridge()
    print("Listening for Work Louder actions. Press Ctrl-C to stop.")
    try:
        while True:
            packet = bridge.read()
            if is_protocol_packet(packet) and packet[4] == CMD_ACTION:
                action = ACTIONS.get(packet[5], f"unknown-{packet[5]}")
                print(action, flush=True)
    except KeyboardInterrupt:
        return 0
    finally:
        bridge.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list", help="List the matching Raw HID interface.")
    subparsers.add_parser("ping", help="Read firmware protocol status.")
    subparsers.add_parser("listen", help="Print button and encoder actions.")

    status_parser = subparsers.add_parser(
        "status", help="Set the Push key's status color."
    )
    status_parser.add_argument("status", choices=STATUSES)
    status_parser.add_argument(
        "--ttl",
        type=int,
        default=0,
        choices=range(0, 256),
        metavar="SECONDS",
        help="Return to the breathing effect after 0-255 seconds.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.command == "list":
            return command_list()
        if args.command == "status":
            return command_status(args.status, args.ttl)
        if args.command == "ping":
            return command_ping()
        if args.command == "listen":
            return command_listen()
    except (RuntimeError, TimeoutError, hid.HIDException) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
