# Contributing

Issues and pull requests are welcome.

## Web Configurator

```bash
npm install
npm test
npm run lint
npm run build
```

Keep WebHID code restricted to the Raw HID collection `0xFF60:0x61`, preserve
unknown 16-bit keycodes, and never write to a device without a clear user
confirmation.

## Firmware

Follow [firmware/BUILDING.md](firmware/BUILDING.md) and test against the pinned
QMK commit. Pull requests that change EEPROM layout, bootloader behavior, USB
identity, or flashing instructions must call those changes out prominently.

Do not submit proprietary factory firmware, extracted secrets, private layout
backups, or files you do not have permission to redistribute.

## Release Safety

Firmware releases should include:

- source corresponding to the binary
- exact QMK commit
- compiler/tool versions
- program and data size
- SHA-256 checksum
- device identity and bootloader
- a read-back or equivalent verification result
