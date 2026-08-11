# Flashing and Recovery

## Read This First

Flashing erases the read-protected factory firmware. This repository does not
contain a factory restore image.

Export the current VIA layout before proceeding. Verify that the board is the
original `work_louder/micro` ATmega32U4 device with VID:PID `574C:E6E3`.

## Recommended Method: QMK Toolbox

1. Download `work_louder_micro_codex.hex` from the latest GitHub release.
2. Verify the SHA-256 checksum published with that release.
3. Open QMK Toolbox and select the HEX file.
4. Enter the Atmel DFU bootloader.
5. Confirm the detected MCU is ATmega32U4.
6. Flash only after accepting the factory-firmware warning above.

## Entering DFU

On a board already running this firmware:

- Hold the upper-right control for at least five seconds, then release it.

The original QMK Bootmagic method is also retained:

- Hold the upper-left horizontal encoder while connecting USB.

Factory firmware revisions vary. If neither method works, stop and investigate
instead of trying a firmware image for a different board.

## Command-Line Method

With `dfu-programmer` installed and the board confirmed in DFU:

```bash
dfu-programmer atmega32u4 erase
dfu-programmer atmega32u4 flash work_louder_micro_codex.hex
dfu-programmer atmega32u4 reset
```

The first command is the irreversible erase step.

## Verify After Flashing

The board should reconnect as:

```text
Work Louder Micro Pad
VID:PID 574C:E6E3
```

Then verify:

```bash
python firmware/bridge/work_louder_bridge.py ping
```

Expected output includes protocol version `1`.

## Recovery

If normal USB mode does not return, re-enter DFU using Bootmagic and reflash
the same verified HEX. Do not flash random vendor or community images in an
attempt to recover the proprietary factory firmware.
