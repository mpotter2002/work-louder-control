import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

import codex_status_watcher as watcher


def event(event_type, timestamp="2026-08-11T22:00:00Z", **payload):
    return {
        "timestamp": timestamp,
        "type": "event_msg",
        "payload": {"type": event_type, **payload},
    }


class InputDetectionTests(unittest.TestCase):
    def test_detects_direct_question(self):
        self.assertTrue(watcher.requests_input("Which profile should I use?"))

    def test_detects_direct_instruction(self):
        self.assertTrue(
            watcher.requests_input("Please confirm before I erase the device.")
        )

    def test_ignores_normal_completion(self):
        self.assertFalse(
            watcher.requests_input("Build complete. The device is connected.")
        )


class ThreadStateTests(unittest.TestCase):
    def test_working_to_complete(self):
        state = watcher.ThreadState()
        state.apply(event("task_started"))
        self.assertTrue(state.active)

        state.apply(
            event(
                "task_complete",
                last_agent_message="Everything passed.",
            )
        )
        self.assertFalse(state.active)
        self.assertGreater(state.complete_until, 0)

    def test_completion_can_wait_for_input(self):
        state = watcher.ThreadState()
        state.apply(event("task_started"))
        state.apply(
            event(
                "task_complete",
                last_agent_message="Please press the upper-right key.",
            )
        )
        self.assertTrue(state.needs_input)
        self.assertEqual(state.complete_until, 0)

    def test_user_message_clears_input_state(self):
        state = watcher.ThreadState(needs_input=True)
        state.apply(event("user_message", message="Done"))
        self.assertFalse(state.needs_input)

    def test_interruption_is_not_reported_as_hardware_error(self):
        state = watcher.ThreadState(active=True)
        state.apply(event("turn_aborted", reason="interrupted"))
        self.assertFalse(state.active)
        self.assertEqual(state.error_until, 0)

    def test_non_user_abort_reports_error_temporarily(self):
        state = watcher.ThreadState(active=True)
        state.apply(event("turn_aborted", reason="crashed"))
        self.assertGreater(state.error_until, 0)


class AggregationTests(unittest.TestCase):
    def test_empty_agent_slots_are_visibly_idle(self):
        now = 100
        active = watcher.ThreadState(active=True, last_event_at=99)

        self.assertEqual(watcher.slot_statuses([], now), ["idle", "idle"])
        self.assertEqual(
            watcher.slot_statuses([active], now),
            ["working", "idle"],
        )

    def test_priority(self):
        now = 100
        self.assertEqual(watcher.aggregate_status([], now), "idle")
        self.assertEqual(
            watcher.aggregate_status(
                [watcher.ThreadState(complete_until=101)], now
            ),
            "complete",
        )
        self.assertEqual(
            watcher.aggregate_status(
                [
                    watcher.ThreadState(complete_until=101),
                    watcher.ThreadState(active=True),
                ],
                now,
            ),
            "working",
        )
        self.assertEqual(
            watcher.aggregate_status(
                [
                    watcher.ThreadState(active=True),
                    watcher.ThreadState(needs_input=True),
                ],
                now,
            ),
            "needs-input",
        )
        self.assertEqual(
            watcher.aggregate_status(
                [
                    watcher.ThreadState(needs_input=True),
                    watcher.ThreadState(error_until=101),
                ],
                now,
            ),
            "error",
        )


class DiscoveryTests(unittest.TestCase):
    def test_filesystem_fallback_discovers_recent_rollouts(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            rollout = root / "sessions" / "2026" / "08" / "task.jsonl"
            rollout.parent.mkdir(parents=True)
            rollout.write_text("{}\n", encoding="utf-8")

            monitor = watcher.RolloutMonitor(root / "state_5.sqlite")
            self.assertEqual(monitor.filesystem_rollouts(), [rollout])


class StatusPublisherTests(unittest.TestCase):
    def test_periodically_resends_unchanged_status_after_device_reboot(self):
        bridges = []

        class FakeBridge:
            def __init__(self):
                self.packets = []
                bridges.append(self)

            def send(self, packet):
                self.packets.append(packet)
                response = bytearray(watcher.build_packet(0, 0, 0))
                response[7] = (
                    packet[6]
                    if packet[4] == watcher.build_slot_packet(0, 0)[4]
                    else packet[5]
                )
                return response

            def take_actions(self):
                return []

            def close(self):
                pass

        clock = Mock(return_value=0)
        with (
            patch.object(watcher, "WorkLouderBridge", FakeBridge),
            patch.object(watcher.time, "monotonic", clock),
        ):
            publisher = watcher.StatusPublisher()
            publisher.publish("working", ["working", "idle"])
            publisher.publish("working", ["working", "idle"])
            clock.return_value = watcher.FULL_SYNC_SECONDS + 0.1
            publisher.publish("working", ["working", "idle"])

        self.assertEqual(len(bridges), 2)
        self.assertEqual([len(bridge.packets) for bridge in bridges], [3, 3])


if __name__ == "__main__":
    unittest.main()
