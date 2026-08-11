# Build manifest

- Built: August 11, 2026
- Keyboard: `work_louder/micro`
- Keymap: `codex`
- MCU: ATmega32U4
- Bootloader: Atmel DFU
- QMK commit: `14774c8482e73033283b836950870f6cc1ef2004`
- QMK CLI: `1.2.0`
- Compiler: Homebrew AVR GCC `9.5.0`
- Program usage: `20,938` bytes
- Bootloader-safe limit: `28,672` bytes
- Remaining program space: `7,734` bytes
- Data usage: `506` of `2,560` bytes
- HEX SHA-256:
  `33582e9959aea9f7084f89d18c4d6c5ce739dab276b9c645824b0bac85fe0ddc`
- ELF SHA-256:
  `968c2b70a1886ccc0224f69772ebd2da8588eda356bbe30868e659692f04e711`

QMK lint and compilation passed. The bridge packet unit tests passed, and its
read-only device enumeration found the expected `0x574C:0xE6E3` Raw HID
interface on usage page `0xFF60`, usage `0x61`.

No firmware erase or write had been performed when this manifest was created.
