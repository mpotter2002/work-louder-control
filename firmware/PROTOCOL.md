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

## Keyboard to host

### Action (`0x80`)

Byte 5 contains the action:

- `1`: Push key
- `2`: effort down
- `3`: effort up

The firmware also emits the existing fallback keycode for each action:
`F14`, `F17`, or `F18`.

## Recovery

Hold the upper-right control for at least five seconds, then release it, to
enter the Atmel DFU bootloader. The board's original Bootmagic method also
remains available: hold the upper-left horizontal encoder while connecting
USB.
