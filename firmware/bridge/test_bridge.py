import unittest

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


if __name__ == "__main__":
    unittest.main()
