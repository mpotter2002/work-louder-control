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
        bridge.run_action("push", repo)
        run.assert_called_once_with(
            ["git", "-C", str(repo), "push"],
            check=True,
        )


if __name__ == "__main__":
    unittest.main()
