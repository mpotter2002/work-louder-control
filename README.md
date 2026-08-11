# Work Louder Micro Codex

Open-source firmware, WebHID configuration, and automatic Codex status
lighting for the original Work Louder Micro Pad / Creator Micro.

This repository contains:

- A browser configurator for four layers, two encoders, profiles, VIA
  assignments, status testing, and diagnostics.
- A QMK keymap with semantic Codex actions and agent-status lighting.
- A macOS bridge that mirrors local Codex task state onto the Push key.
- The exact tested `v0.1.0` HEX image and its SHA-256 checksum.

**Configurator:** https://work-louder-control.vercel.app

## Compatibility

Only use this firmware with the QMK target `work_louder/micro`:

- MCU: ATmega32U4
- USB VID:PID: `574C:E6E3`
- Bootloader: Atmel DFU
- VIA protocol: `0x000D`

Do not flash it onto another Work Louder product or hardware revision just
because the enclosure looks similar.

## Important Flash Warning

The factory firmware on tested boards is read-protected. Flashing this image
erases it, and this project cannot provide a factory-firmware restore image.

Before flashing:

1. Export every layer, encoder, and macro you can from VIA.
2. Confirm the device identity and MCU.
3. Read [the flashing guide](firmware/FLASHING.md).
4. Accept that returning to the proprietary factory firmware may not be
   possible without help from Work Louder.

The browser configurator does not flash firmware. It only communicates with a
board that is already running compatible VIA/Raw HID firmware.

## Repository Layout

```text
firmware/
  keymaps/codex/       Custom QMK keymap source
  bridge/              Python HID bridge and macOS installer
  releases/v0.1.0/     Tested HEX, checksums, and flash result
  BUILDING.md          Reproducible QMK build instructions
  FLASHING.md          DFU flashing and recovery guide
src/                   React WebHID configurator
```

## Web Development

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev -- --host 127.0.0.1
```

Open the printed `http://127.0.0.1:<port>` URL.

```bash
npm test
npm run lint
npm run build
```

WebHID requires desktop Chrome or Edge and either HTTPS or a loopback
development origin. Profiles remain local to the browser.

## Firmware Features

- Four VIA-remappable layers
- Two VIA-remappable encoders
- Full-board breathing RGB
- Push-key status overlay:
  - idle: white
  - working: blue
  - needs input: yellow
  - complete: green
  - error: pink-red
- Versioned `WL` Raw HID protocol
- Semantic Push and reasoning-effort events with F14/F17/F18 fallbacks
- Five-second maintenance hold for DFU recovery

See [the protocol reference](firmware/PROTOCOL.md) for packet details.

## Limitations

- `v0.1.0` hard-codes status colors and animation.
- Macro text is preserved by the web profile format but is not currently
  written to VIA's macro buffer.
- Several Codex commands still type text; Push and effort controls are the
  semantic Raw HID actions in this release.
- The macOS status bridge reads Codex's local task files, which are an
  implementation detail and may change in future Codex versions.

## License

This project is licensed under GPL-2.0-or-later. See [LICENSE](LICENSE).
Work Louder, Figma, VIA, QMK, GitHub, Vercel, and OpenAI/Codex names and
trademarks belong to their respective owners. See [NOTICE.md](NOTICE.md).
