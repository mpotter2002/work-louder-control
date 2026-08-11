# Work Louder Control

Local-first WebHID configurator for the Work Louder Micro Pad running the custom
Codex firmware.

## Development

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

## Browser support

Device access uses WebHID and currently requires desktop Chrome or Edge.
Firefox and Safari do not expose WebHID. The user must grant device permission
from the Connect button. WebHID also requires a secure context: HTTPS in
production or a loopback development origin such as `http://127.0.0.1`.

The app filters for USB VID `0x574C`, PID `0xE6E3`, and the Raw HID collection
`0xFF60:0x61`. Profile editing, import, and export work without a connected
device. Profiles are stored locally in the browser.

## Protocols

- VIA protocol `0x000D`: layer count, dynamic keycode get/set, and encoder
  get/set.
- Work Louder private protocol `0xFE`, signature `WL`, version `1`: ping,
  status commands, and incoming Push / effort action events.

Unknown 16-bit keycodes are kept as numeric values and remain round-trippable.
The included profiles contain the currently flashed Candidate 1 layout and the
archived `creator_micro.layout.json` backup.

## Firmware limitations

- Candidate 1 hard-codes status colors and the breathing effect. The app can
  test status values and TTLs, but cannot persist custom colors, brightness, or
  animation settings.
- Profile apply writes the dynamic 4x4 keymap and both encoder directions.
  Archived macro text is retained in profile JSON but the current apply flow
  does not rewrite VIA's macro buffer.
- Automatic Codex task-state lighting is provided by the separate macOS bridge
  in the firmware workspace; the webpage can also send manual status tests.
- The custom action keycodes depend on Candidate 1's `SAFE_RANGE` ordering. A
  future firmware protocol should expose a capability/action table instead of
  requiring the UI to know those numeric values.

## Vercel deployment

The app is a static Vite build. For Vercel:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

No server environment variables are required. Production must use HTTPS for
WebHID. Each browser profile still needs a one-time user gesture to authorize
the device.

The Vercel project is connected to this repository's `main` branch, so pushes
create production deployments automatically.
