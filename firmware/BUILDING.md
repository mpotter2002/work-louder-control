# Building the Firmware

The tested `v0.1.0` image was built from:

- QMK target: `work_louder/micro`
- keymap: `codex`
- QMK commit: `14774c8482e73033283b836950870f6cc1ef2004`
- QMK CLI: `1.2.0`
- AVR GCC: `9.5.0`

## Prepare QMK

Install the QMK prerequisites for your operating system, then clone and pin
QMK:

```bash
git clone https://github.com/qmk/qmk_firmware.git
cd qmk_firmware
git checkout 14774c8482e73033283b836950870f6cc1ef2004
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Copy the keymap from this repository:

```bash
cp -R /path/to/work-louder-control/firmware/keymaps/codex \
  keyboards/work_louder/micro/keymaps/
```

Compile:

```bash
.venv/bin/qmk compile -kb work_louder/micro -km codex
```

The resulting image is:

```text
work_louder_micro_codex.hex
```

Compare its size and checksum with [BUILD_MANIFEST.md](BUILD_MANIFEST.md).
Different toolchains may produce a different byte-for-byte image even when the
firmware behavior is equivalent.

Compiling does not modify a connected device.
