export interface KeycodeOption {
  label: string
  shortLabel?: string
  description?: string
  shortcut?: string
  code: string
  value: number
}

const BASIC: Record<string, number> = {
  KC_NO: 0x0000,
  KC_TRNS: 0x0001,
  KC_A: 0x0004,
  KC_B: 0x0005,
  KC_C: 0x0006,
  KC_D: 0x0007,
  KC_E: 0x0008,
  KC_F: 0x0009,
  KC_G: 0x000a,
  KC_H: 0x000b,
  KC_I: 0x000c,
  KC_J: 0x000d,
  KC_K: 0x000e,
  KC_L: 0x000f,
  KC_M: 0x0010,
  KC_N: 0x0011,
  KC_O: 0x0012,
  KC_P: 0x0013,
  KC_Q: 0x0014,
  KC_R: 0x0015,
  KC_S: 0x0016,
  KC_T: 0x0017,
  KC_U: 0x0018,
  KC_V: 0x0019,
  KC_W: 0x001a,
  KC_X: 0x001b,
  KC_Y: 0x001c,
  KC_Z: 0x001d,
  KC_1: 0x001e,
  KC_2: 0x001f,
  KC_3: 0x0020,
  KC_4: 0x0021,
  KC_5: 0x0022,
  KC_6: 0x0023,
  KC_7: 0x0024,
  KC_8: 0x0025,
  KC_9: 0x0026,
  KC_0: 0x0027,
  KC_ENT: 0x0028,
  KC_ESC: 0x0029,
  KC_BSPC: 0x002a,
  KC_TAB: 0x002b,
  KC_SPC: 0x002c,
  KC_MINS: 0x002d,
  KC_EQL: 0x002e,
  KC_LBRC: 0x002f,
  KC_RBRC: 0x0030,
  KC_BSLS: 0x0031,
  KC_SCLN: 0x0033,
  KC_QUOT: 0x0034,
  KC_GRV: 0x0035,
  KC_COMM: 0x0036,
  KC_DOT: 0x0037,
  KC_SLSH: 0x0038,
  KC_CAPS: 0x0039,
  KC_F1: 0x003a,
  KC_F2: 0x003b,
  KC_F3: 0x003c,
  KC_F4: 0x003d,
  KC_F5: 0x003e,
  KC_F6: 0x003f,
  KC_F7: 0x0040,
  KC_F8: 0x0041,
  KC_F9: 0x0042,
  KC_F10: 0x0043,
  KC_F11: 0x0044,
  KC_F12: 0x0045,
  KC_INS: 0x0049,
  KC_HOME: 0x004a,
  KC_PGUP: 0x004b,
  KC_DEL: 0x004c,
  KC_END: 0x004d,
  KC_PGDN: 0x004e,
  KC_RGHT: 0x004f,
  KC_LEFT: 0x0050,
  KC_DOWN: 0x0051,
  KC_UP: 0x0052,
  KC_F13: 0x0068,
  KC_F14: 0x0069,
  KC_F15: 0x006a,
  KC_F16: 0x006b,
  KC_F17: 0x006c,
  KC_F18: 0x006d,
  KC_F19: 0x006e,
  KC_F20: 0x006f,
  KC_MUTE: 0x00a7,
  KC_VOLU: 0x00a9,
  KC_VOLD: 0x00aa,
  KC_MNXT: 0x00ab,
  KC_MPRV: 0x00ac,
  KC_MSTP: 0x00ad,
  KC_MPLY: 0x00ae,
  KC_MS_WH_UP: 0x00d9,
  KC_MS_WH_DOWN: 0x00da,
  UG_TOGG: 0x7820,
  RGB_TOG: 0x7820,
}

const MODIFIERS: Record<string, number> = {
  C: 0x0100,
  S: 0x0200,
  A: 0x0400,
  G: 0x0800,
  LCTL: 0x0100,
  LSFT: 0x0200,
  LALT: 0x0400,
  LGUI: 0x0800,
  LCS: 0x0300,
  LCA: 0x0500,
  LCG: 0x0900,
  LSA: 0x0600,
  LSG: 0x0a00,
  LAG: 0x0c00,
  LCSG: 0x0b00,
  LCAG: 0x0d00,
  LSAG: 0x0e00,
}

const LAYERS: Record<string, number> = {
  TO: 0x5200,
  MO: 0x5220,
  DF: 0x5240,
  TG: 0x5260,
  OSL: 0x5280,
}

export const CUSTOM_ACTIONS: Record<string, number> = {
  WL_PET: 0x7e40,
  WL_PUSH: 0x7e41,
  WL_EFFORT_DOWN: 0x7e42,
  WL_EFFORT_UP: 0x7e43,
  WL_MAINTENANCE: 0x7e44,
  WL_FIGMA: 0x7e45,
  WL_VOICE: 0x7e46,
  WL_SKILLS: 0x7e47,
  WL_MCP: 0x7e48,
  WL_SIDE_CHAT: 0x7e49,
}

const NAMES_BY_VALUE = new Map<number, string>()
Object.entries(BASIC).forEach(([name, value]) => {
  if (!NAMES_BY_VALUE.has(value)) NAMES_BY_VALUE.set(value, name)
})
Object.entries(CUSTOM_ACTIONS).forEach(([name, value]) => NAMES_BY_VALUE.set(value, name))

export function parseKeycode(input: string | number): number | null {
  if (typeof input === 'number') {
    return Number.isInteger(input) && input >= 0 && input <= 0xffff ? input : null
  }
  const value = input.trim().toUpperCase()
  if (value in BASIC) return BASIC[value]
  if (value in CUSTOM_ACTIONS) return CUSTOM_ACTIONS[value]
  if (/^0X[0-9A-F]{1,4}$/.test(value)) return Number.parseInt(value.slice(2), 16)
  if (/^\d{1,5}$/.test(value)) {
    const parsed = Number.parseInt(value, 10)
    return parsed <= 0xffff ? parsed : null
  }

  const macro = value.match(/^MACRO\((\d{1,3})\)$/)
  if (macro) {
    const slot = Number(macro[1])
    return slot <= 127 ? 0x7700 | slot : null
  }

  const layer = value.match(/^(TO|MO|DF|TG|OSL)\((\d{1,2})\)$/)
  if (layer) {
    const index = Number(layer[2])
    return index <= 31 ? LAYERS[layer[1]] | index : null
  }

  const modified = value.match(/^([A-Z]+)\((.+)\)$/)
  if (modified && modified[1] in MODIFIERS) {
    const basic = parseKeycode(modified[2])
    if (basic !== null && basic <= 0xff) return MODIFIERS[modified[1]] | basic
  }
  return null
}

export function toHex(value: number) {
  return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`
}

export function formatKeycode(value: number): string {
  const direct = NAMES_BY_VALUE.get(value)
  if (direct) return direct.replace(/^KC_/, '')
  if (value >= 0x7700 && value <= 0x777f) return `MACRO ${value - 0x7700}`
  for (const [name, base] of Object.entries(LAYERS)) {
    if (value >= base && value <= base + 0x1f) return `${name}(${value & 0x1f})`
  }
  if (value >= 0x0100 && value <= 0x1fff) {
    const basicName = NAMES_BY_VALUE.get(value & 0xff)
    if (basicName) {
      const mods = (value >> 8) & 0x0f
      const parts = [
        mods & 1 ? 'C' : '',
        mods & 2 ? 'S' : '',
        mods & 4 ? 'A' : '',
        mods & 8 ? 'G' : '',
      ].filter(Boolean)
      return `${parts.join('')}(${basicName.replace(/^KC_/, '')})`
    }
  }
  return toHex(value)
}

export function keycodeDescription(value: number): string {
  const custom = Object.entries(CUSTOM_ACTIONS).find(([, code]) => code === value)?.[0]
  if (custom) {
    return (
      {
        WL_PET: 'Open the Codex pet',
        WL_PUSH: 'Send the Push semantic action',
        WL_EFFORT_DOWN: 'Decrease reasoning effort',
        WL_EFFORT_UP: 'Increase reasoning effort',
        WL_MAINTENANCE: 'Hold for bootloader recovery',
        WL_FIGMA: 'Launch Figma through the bridge',
        WL_VOICE: 'Toggle Codex dictation',
        WL_SKILLS: 'Open the Codex skills catalog',
        WL_MCP: 'Open Codex MCP settings',
        WL_SIDE_CHAT: 'Open a Codex side chat',
      }[custom] ?? custom
    )
  }
  if (value >= 0x7700 && value <= 0x777f) return `VIA dynamic macro slot ${value - 0x7700}`
  if (value >= 0x7e00) return `Custom or firmware keycode ${toHex(value)}`
  if (value >= 0x5200 && value <= 0x52ff) return 'QMK layer control'
  if (value >= 0x0100 && value <= 0x1fff) return 'Modified keyboard key'
  return NAMES_BY_VALUE.has(value) ? 'Keyboard keycode' : `Unknown keycode ${toHex(value)}`
}

function option(label: string, code: string): KeycodeOption {
  const value = parseKeycode(code)
  if (value === null) throw new Error(`Invalid built-in keycode: ${code}`)
  return { label, code, value }
}

function codexOption(
  label: string,
  shortLabel: string,
  code: string,
  shortcut: string,
  description: string,
): KeycodeOption {
  return { ...option(label, code), shortLabel, shortcut, description }
}

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => option(letter, `KC_${letter}`))
const numbers = '1234567890'.split('').map((number) => option(number, `KC_${number}`))

export const ASSIGNMENT_GROUPS: {
  id: string
  label: string
  items: KeycodeOption[]
}[] = [
  {
    id: 'codex',
    label: 'Codex App',
    items: [
      codexOption(
        'Open side chat',
        'Side chat',
        'WL_SIDE_CHAT',
        '⌥⌘S',
        'Open or close the side chat panel',
      ),
      codexOption(
        'Toggle file tree',
        'File tree',
        'LSG(KC_E)',
        '⇧⌘E',
        'Show or hide files for the current workspace',
      ),
      codexOption(
        'Search chats',
        'Search',
        'LCA(KC_F)',
        '⌃⌥F',
        'Find and switch between Codex chats',
      ),
      codexOption(
        'Open browser tab',
        'Browser',
        'G(KC_T)',
        '⌘T',
        'Open a new tab in the Codex browser panel',
      ),
      codexOption(
        'Toggle voice dictation',
        'Voice Dictation',
        'LCA(KC_D)',
        '⌃⌥D',
        'Press once to start Codex dictation and again to stop',
      ),
      codexOption(
        'Open Skills',
        'Skills',
        'WL_SKILLS',
        '⌃⌥S',
        'Open the Codex skills catalog',
      ),
      codexOption(
        'Open MCP settings',
        'MCP',
        'WL_MCP',
        '⌃⌥M',
        'Manage connected MCP tools and servers',
      ),
      codexOption(
        'New chat',
        'New chat',
        'G(KC_N)',
        '⌘N',
        'Start a new Codex chat',
      ),
      codexOption(
        'Open command menu',
        'Commands',
        'G(KC_K)',
        '⌘K',
        'Search all available Codex commands',
      ),
      codexOption(
        'Toggle browser panel',
        'Browser panel',
        'LSG(KC_B)',
        '⇧⌘B',
        'Show or hide the browser panel',
      ),
      codexOption(
        'Toggle bottom panel',
        'Bottom panel',
        'G(KC_J)',
        '⌘J',
        'Show or hide the terminal and output area',
      ),
      codexOption(
        'Toggle sidebar',
        'Sidebar',
        'G(KC_B)',
        '⌘B',
        'Show or hide the main task sidebar',
      ),
      codexOption(
        'Open terminal',
        'Terminal',
        'C(KC_GRV)',
        '⌃`',
        'Open the integrated terminal',
      ),
      codexOption(
        'Search workspace files',
        'Find files',
        'G(KC_P)',
        '⌘P',
        'Search files in the current workspace',
      ),
      codexOption(
        'Previous chat',
        'Previous chat',
        'LSG(KC_LBRC)',
        '⇧⌘[',
        'Move to the previous visible chat',
      ),
      codexOption(
        'Next chat',
        'Next chat',
        'LSG(KC_RBRC)',
        '⇧⌘]',
        'Move to the next visible chat',
      ),
      codexOption(
        'Decrease reasoning effort',
        'Effort down',
        'WL_EFFORT_DOWN',
        '⌃⌥↓',
        'Use a faster, lighter reasoning level',
      ),
      codexOption(
        'Increase reasoning effort',
        'Effort up',
        'WL_EFFORT_UP',
        '⌃⌥↑',
        'Use a deeper reasoning level',
      ),
      codexOption(
        'Show keyboard shortcuts',
        'Shortcuts',
        'G(KC_SLSH)',
        '⌘/',
        'Open Codex keyboard shortcut settings',
      ),
      codexOption(
        'Open Codex pet',
        'Pet',
        'WL_PET',
        '/pet',
        'Open the Codex companion',
      ),
    ],
  },
  {
    id: 'keys',
    label: 'Keys',
    items: [
      option('Disabled', 'KC_NO'),
      option('Transparent', 'KC_TRNS'),
      ...letters,
      ...numbers,
      option('Enter', 'KC_ENT'),
      option('Escape', 'KC_ESC'),
      option('Space', 'KC_SPC'),
      option('Tab', 'KC_TAB'),
      option('Backspace', 'KC_BSPC'),
      option('Delete', 'KC_DEL'),
      option('Up', 'KC_UP'),
      option('Down', 'KC_DOWN'),
      option('Left', 'KC_LEFT'),
      option('Right', 'KC_RGHT'),
      option('Volume up', 'KC_VOLU'),
      option('Volume down', 'KC_VOLD'),
      option('Play / pause', 'KC_MPLY'),
      option('Mouse wheel up', 'KC_MS_WH_UP'),
      option('Mouse wheel down', 'KC_MS_WH_DOWN'),
    ],
  },
  {
    id: 'layers',
    label: 'Layers',
    items: [0, 1, 2, 3].flatMap((layer) => [
      option(`Switch to layer ${layer}`, `TO(${layer})`),
      option(`Hold layer ${layer}`, `MO(${layer})`),
      option(`Toggle layer ${layer}`, `TG(${layer})`),
    ]),
  },
  {
    id: 'macros',
    label: 'Macros',
    items: Array.from({ length: 16 }, (_, index) => option(`Macro slot ${index}`, `MACRO(${index})`)),
  },
  {
    id: 'firmware',
    label: 'Firmware',
    items: [
      { ...option('Push repository', 'WL_PUSH'), shortLabel: 'Push' },
      { ...option('Maintenance / recovery', 'WL_MAINTENANCE'), shortLabel: 'Recovery' },
      { ...option('Launch Figma', 'WL_FIGMA'), shortLabel: 'Figma' },
      { ...option('Lighting toggle', 'UG_TOGG'), shortLabel: 'Lights' },
      option('F14 fallback', 'KC_F14'),
      option('F15 fallback', 'KC_F15'),
    ],
  },
]

export function assignmentOption(value: number, preferredGroupId?: string) {
  if (preferredGroupId) {
    const preferred = ASSIGNMENT_GROUPS.find((group) => group.id === preferredGroupId)?.items.find(
      (item) => item.value === value,
    )
    if (preferred || preferredGroupId !== 'codex') return preferred
  }
  return ASSIGNMENT_GROUPS.flatMap((group) => group.items).find((item) => item.value === value)
}

export function assignmentLabel(value: number, preferredGroupId?: string) {
  const item = assignmentOption(value, preferredGroupId)
  return item?.shortLabel ?? item?.label ?? formatKeycode(value)
}
