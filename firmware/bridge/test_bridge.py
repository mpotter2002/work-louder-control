import unittest
from pathlib import Path
from unittest.mock import patch

import work_louder_bridge as bridge


class PacketTests(unittest.TestCase):
    def test_status_packet(self):
        packet = bridge.build_packet(
            bridge.CMD_SET_STATUS, bridge.STATUSES["working"], 30
        )
        self.assertEqual(len(packet), bridge.REPORT_SIZE)
        self.assertEqual(packet[:5], b"\xfeWL\x01\x01")
        self.assertEqual(packet[5:7], bytes((2, 30)))
        self.assertTrue(bridge.is_protocol_packet(packet))

    def test_rejects_other_packets(self):
        self.assertFalse(bridge.is_protocol_packet(bytes(bridge.REPORT_SIZE)))

    def test_push_action_targets_configured_repository(self):
        repo = Path("/tmp/work-louder-control")
        self.assertEqual(
            bridge.action_command("push", repo),
            ["git", "-C", str(repo), "push"],
        )

    def test_push_action_is_disabled_without_repository(self):
        self.assertIsNone(bridge.action_command("push"))

    @patch.object(bridge.subprocess, "run")
    def test_run_action_executes_push(self, run):
        repo = Path("/tmp/work-louder-control")
        run.side_effect = [
            bridge.subprocess.CompletedProcess([], 0, stdout="1\n"),
            bridge.subprocess.CompletedProcess([], 0),
        ]
        self.assertEqual(
            bridge.run_action("push", repo),
            bridge.ACTION_SUCCESS,
        )
        self.assertEqual(run.call_count, 2)
        run.assert_any_call(
            [
                "git",
                "-C",
                str(repo),
                "rev-list",
                "--count",
                "@{upstream}..HEAD",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        run.assert_any_call(["git", "-C", str(repo), "push"], check=True)

    @patch.object(bridge.subprocess, "run")
    def test_run_action_reports_nothing_to_push(self, run):
        repo = Path("/tmp/work-louder-control")
        run.return_value = bridge.subprocess.CompletedProcess(
            [],
            0,
            stdout="0\n",
        )
        self.assertEqual(
            bridge.run_action("push", repo),
            bridge.ACTION_NOOP,
        )
        self.assertEqual(run.call_count, 1)

    @patch.object(bridge.subprocess, "run")
    def test_run_action_reports_failure(self, run):
        run.side_effect = bridge.subprocess.CalledProcessError(1, ["git"])
        self.assertEqual(
            bridge.run_action("push", Path("/tmp/work-louder-control")),
            bridge.ACTION_ERROR,
        )


if __name__ == "__main__":
    unittest.main()
