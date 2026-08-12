# Work Louder Codex HID protocol

The `codex` keymap keeps VIA enabled and reserves VIA command ID `0xFE` for a
small host bridge. All reports are 32 bytes and use this header:

| Byte | Value | Meaning |
| --- | --- | --- |
| 0 | `0xFE` | Private command ID |
| 1 | `W` | Signature |
| 2 | `L` | Signature |
| 3 | `0x01` | Protocol version |
| 4 | command | Command ID |

## Host to keyboard

### Set status (`0x01`)

- Byte 5: status
- Byte 6: time to live in seconds (`0` means no timeout)
- Byte 7 in the response: accepted status

Statuses:

- `0`: no overlay; the Push key rejoins the breathing effect
- `1`: idle, white
- `2`: working, blue
- `3`: needs input, yellow
- `4`: complete, green
- `5`: error, pink-red

### Ping (`0x02`)

The response returns the current status in byte 5.

### Set lighting profile (`0x03`)

Updates one of the four runtime layer-lighting profiles. This command does not
write EEPROM.

- Byte 5: layer (`0` Figma, `1` Codex, `2` PC, `3` Extra)
- Byte 6: effect (`0` static gradient, `1` breathing, `2` orbit, `3` wave,
  `4` twinkle)
- Bytes 7-9: primary hue, saturation, brightness
- Bytes 10-11: accent hue, saturation
- Byte 12: speed

The response returns the accepted layer and effect in bytes 5 and 6. Layer
changes activate their associated lighting profile automatically.

### Set thread slot status (`0x04`)

Sets one of the two parallel-agent indicators on the top row of the Codex
layer. Slot `0` is the second key from the left and slot `1` is the key beside
it; the two outer corners of that row have no LED. Slot indicators are
independent of the aggregate status set by `0x01`.

- Byte 5: slot (`0` or `1`)
- Byte 6: status, using the same values as `0x01`
- Byte 7: time to live in seconds (`0` means no timeout)
- Byte 7 in the response: accepted status

An out-of-range slot returns `0xFF` as the command byte.

### Get lighting capabilities (`0x05`)

The response identifies profile-lighting support:

- Byte 5: capability revision (`1`)
- Byte 6: number of supported effects
- Byte 7: number of supported layer profiles

Firmware before this capability returns `0xFF` as the command byte. The web
configurator uses that response to keep lighting preview disabled while still
allowing profiles to be edited and exported.

## Keyboard to host

### Action (`0x80`)

Byte 5 contains the action:

- `1`: Push key
- `2`: effort down
- `3`: effort up
- `4`: launch Figma

Two Codex commands ship with no default binding and are assigned in
`~/.codex/keybindings.json`: `openSkills` on `Ctrl+Alt+S` and `mcpSettings` on
`Ctrl+Alt+M`, matching the two upper keys of the Codex layer.

Actions `1` and `4` also emit a fallback keycode, `F14` and `F15`, so a host
without the bridge running can still bind them. The effort actions instead tap
`Ctrl+Alt+Down` and `Ctrl+Alt+Up`, which must be assigned to
`composer.decreaseReasoningEffort` and `composer.increaseReasoningEffort` in
Codex under Settings, Keyboard Shortcuts, because those commands ship with no
default binding.

Run `work_louder_bridge.py listen --run` to have the bridge carry out host
actions such as opening Figma.

## Recovery

Hold the upper-right control for at least five seconds, then release it, to
enter the Atmel DFU bootloader. The board's original Bootmagic method also
remains available: hold the upper-left horizontal encoder while connecting
USB.
