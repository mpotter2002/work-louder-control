import { parseKeycode } from './keycodes'
import type { LightingEffectId, LightingSettings, Profile } from '../types'

const STORAGE_KEY = 'work-louder-control.profiles.v1'
const FORMAT = 'work-louder-control-profile'
const LIGHTING_EFFECTS: LightingEffectId[] = ['static', 'breathing', 'orbit', 'wave', 'twinkle']

const ARCHIVED_LAYERS = [
  [
    'G(KC_T)',
    'KC_V',
    'KC_P',
    'KC_NO',
    'S(KC_L)',
    'KC_R',
    'KC_O',
    'KC_L',
    'A(KC_A)',
    'LCA(KC_V)',
    'LCA(KC_H)',
    'A(KC_D)',
    'RGB_TOG',
    'KC_F',
    'KC_C',
    'TO(1)',
  ],
  [
    'KC_NO',
    'G(KC_N)',
    'KC_F14',
    'KC_NO',
    'C(KC_GRV)',
    'MACRO(8)',
    'MACRO(9)',
    'MACRO(10)',
    'MACRO(11)',
    'KC_TRNS',
    'KC_TRNS',
    'KC_TRNS',
    'KC_NO',
    'G(KC_K)',
    'LSG(KC_P)',
    'TO(0)',
  ],
  [
    'C(KC_T)',
    'KC_V',
    'KC_P',
    'KC_NO',
    'S(KC_L)',
    'KC_R',
    'KC_O',
    'KC_L',
    'A(KC_A)',
    'LSA(KC_V)',
    'LSA(KC_H)',
    'A(KC_D)',
    'KC_NO',
    'KC_F',
    'KC_C',
    'TO(3)',
  ],
  [
    'KC_NO',
    'KC_TRNS',
    'KC_TRNS',
    'KC_NO',
    'KC_TRNS',
    'KC_TRNS',
    'KC_TRNS',
    'KC_TRNS',
    'S(KC_M)',
    'KC_S',
    'KC_T',
    'KC_E',
    'KC_NO',
    'S(KC_S)',
    'KC_C',
    'TO(0)',
  ],
]

const ARCHIVED_ENCODERS = [
  [
    ['KC_MINS', 'KC_EQL'],
    ['KC_MS_WH_UP', 'KC_MS_WH_DOWN'],
    ['KC_TRNS', 'KC_TRNS'],
    ['KC_TRNS', 'KC_TRNS'],
  ],
  [
    ['LSG(KC_Z)', 'G(KC_Z)'],
    ['KC_F17', 'KC_F18'],
    ['C(KC_Z)', 'C(KC_Y)'],
    ['KC_TRNS', 'KC_TRNS'],
  ],
]

const ARCHIVED_MACROS = [
  '{+KC_LGUI}z{-KC_LGUI}',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  'List installed skills and what each does.{KC_ENT}',
  'List configured MCP servers and available tools.{KC_ENT}',
  '/pet{KC_ENT}',
  '/side{KC_ENT}',
  '',
  '',
  '',
  '',
]

const CURRENT_LAYERS = [
  [
    'G(KC_T)',
    'KC_V',
    'KC_P',
    'WL_MAINTENANCE',
    'S(KC_L)',
    'KC_R',
    'KC_O',
    'KC_L',
    'A(KC_A)',
    'LCA(KC_V)',
    'LCA(KC_H)',
    'A(KC_D)',
    'WL_FIGMA',
    'KC_F',
    'KC_C',
    'TO(1)',
  ],
  [
    'WL_SKILLS',
    'LCA(KC_F)',
    'WL_MCP',
    'WL_MAINTENANCE',
    'WL_SIDE_CHAT',
    'G(KC_T)',
    'G(KC_N)',
    'WL_PET',
    'WL_SIDE_CHAT',
    'WL_SIDE_CHAT',
    'G(KC_J)',
    'LSG(KC_E)',
    'WL_FIGMA',
    'LCA(KC_D)',
    'WL_PUSH',
    'TO(0)',
  ],
  [
    'C(KC_T)',
    'KC_V',
    'KC_P',
    'WL_MAINTENANCE',
    'S(KC_L)',
    'KC_R',
    'KC_O',
    'KC_L',
    'A(KC_A)',
    'LSA(KC_V)',
    'LSA(KC_H)',
    'A(KC_D)',
    'KC_NO',
    'KC_F',
    'KC_C',
    'TO(3)',
  ],
  [
    'KC_NO',
    'KC_TRNS',
    'KC_TRNS',
    'WL_MAINTENANCE',
    'KC_TRNS',
    'KC_TRNS',
    'KC_TRNS',
    'KC_TRNS',
    'S(KC_M)',
    'KC_S',
    'KC_T',
    'KC_E',
    'KC_NO',
    'S(KC_S)',
    'KC_C',
    'TO(0)',
  ],
]

const CURRENT_ENCODERS = [
  [
    ['KC_MINS', 'KC_EQL'],
    ['KC_MS_WH_UP', 'KC_MS_WH_DOWN'],
    ['KC_TRNS', 'KC_TRNS'],
    ['KC_TRNS', 'KC_TRNS'],
  ],
  [
    ['LSG(KC_Z)', 'G(KC_Z)'],
    ['WL_EFFORT_DOWN', 'WL_EFFORT_UP'],
    ['C(KC_Z)', 'C(KC_Y)'],
    ['KC_TRNS', 'KC_TRNS'],
  ],
]

const DEFAULT_LIGHTING: LightingSettings[] = [
  {
    effect: 'orbit',
    primaryColor: '#ff5a1f',
    secondaryColor: '#ff00a8',
    brightness: 142,
    speed: 74,
  },
  {
    effect: 'orbit',
    primaryColor: '#00c8ff',
    secondaryColor: '#ff3b9d',
    brightness: 150,
    speed: 86,
  },
  {
    effect: 'orbit',
    primaryColor: '#1fe87a',
    secondaryColor: '#2068ff',
    brightness: 146,
    speed: 102,
  },
  {
    effect: 'orbit',
    primaryColor: '#ffc400',
    secondaryColor: '#ff2f7d',
    brightness: 144,
    speed: 94,
  },
]

function createDefaultLighting() {
  return structuredClone(DEFAULT_LIGHTING)
}

function parseSeed(code: string): number {
  const value = parseKeycode(code)
  if (value === null) throw new Error(`Unable to parse archived keycode ${code}`)
  return value
}

function createProfile(
  name: string,
  source: string,
  layers: string[][],
  encoders: string[][][],
  macros: string[],
): Profile {
  const timestamp = new Date().toISOString()
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name,
    source,
    createdAt: timestamp,
    updatedAt: timestamp,
    dirty: false,
    device: { vendorId: 0x574c, productId: 0xe6e3 },
    layers: layers.map((layer) => layer.map(parseSeed)),
    encoders: layers.map((_, layer) =>
      encoders.map(
        (encoder) => encoder[layer].map(parseSeed) as [number, number],
      ),
    ),
    macros: [...macros],
    lighting: createDefaultLighting(),
  }
}

export function createFirmwareProfile(name = 'Codex Candidate 2'): Profile {
  return createProfile(
    name,
    'Current firmware candidate built August 14, 2026',
    CURRENT_LAYERS,
    CURRENT_ENCODERS,
    ARCHIVED_MACROS,
  )
}

export function createSeedProfile(name = 'Creator Micro Backup'): Profile {
  return createProfile(
    name,
    'Seeded from creator_micro.layout.json · August 11, 2026',
    ARCHIVED_LAYERS,
    ARCHIVED_ENCODERS,
    ARCHIVED_MACROS,
  )
}

export function createStoredProfiles() {
  return [createFirmwareProfile(), createSeedProfile()]
}

export function duplicateProfile(profile: Profile): Profile {
  const timestamp = new Date().toISOString()
  return {
    ...structuredClone(profile),
    id: crypto.randomUUID(),
    name: `${profile.name} Copy`,
    createdAt: timestamp,
    updatedAt: timestamp,
    dirty: true,
  }
}

export function saveProfiles(profiles: Profile[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
}

export function loadProfiles(): Profile[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (!value) return []
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.map(normalizeProfile).filter((profile): profile is Profile => profile !== null)
      : []
  } catch {
    return []
  }
}

export function exportProfiles(profiles: Profile[]) {
  return JSON.stringify(
    {
      format: FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      profiles: profiles.map(({ dirty: _dirty, ...profile }) => profile),
    },
    null,
    2,
  )
}

export function importProfiles(contents: string): Profile[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch {
    throw new Error('The selected file is not valid JSON')
  }
  if (!isRecord(parsed) || parsed.format !== FORMAT || parsed.version !== 1) {
    throw new Error('This is not a Work Louder Control profile export')
  }
  if (!Array.isArray(parsed.profiles) || parsed.profiles.length === 0) {
    throw new Error('The profile export does not contain any profiles')
  }
  const profiles = parsed.profiles.map(normalizeProfile)
  if (profiles.some((profile) => profile === null)) {
    throw new Error('The profile export contains invalid layout data')
  }
  return (profiles as Profile[]).map((profile) => ({
    ...structuredClone(profile),
    id: crypto.randomUUID(),
    dirty: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isProfile(value: unknown): value is Profile {
  return normalizeProfile(value) !== null
}

function normalizeProfile(value: unknown): Profile | null {
  if (!isRecord(value)) return null
  if (
    value.schemaVersion !== 1 ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.source !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !isRecord(value.device) ||
    value.device.vendorId !== 0x574c ||
    value.device.productId !== 0xe6e3 ||
    !Array.isArray(value.layers) ||
    value.layers.length !== 4 ||
    !Array.isArray(value.encoders) ||
    value.encoders.length !== 4 ||
    !Array.isArray(value.macros)
  ) {
    return null
  }
  const validKeycode = (keycode: unknown) =>
    Number.isInteger(keycode) && Number(keycode) >= 0 && Number(keycode) <= 0xffff
  const hasValidLayout = (
    value.layers.every(
      (layer) => Array.isArray(layer) && layer.length === 16 && layer.every(validKeycode),
    ) &&
    value.encoders.every(
      (layer) =>
        Array.isArray(layer) &&
        layer.length === 2 &&
        layer.every(
          (encoder) =>
            Array.isArray(encoder) && encoder.length === 2 && encoder.every(validKeycode),
        ),
    ) &&
    value.macros.length <= 128 &&
    value.macros.every((macro) => typeof macro === 'string')
  )
  if (!hasValidLayout) return null

  const lighting = normalizeLighting(value.lighting)
  if (lighting === null) return null

  return {
    ...value,
    lighting,
  } as Profile
}

function normalizeLighting(value: unknown): LightingSettings[] | null {
  if (value === undefined) return createDefaultLighting()
  if (!Array.isArray(value) || value.length !== 4) return null

  const lighting = value.map((setting) => {
    if (!isRecord(setting)) return null
    if (
      typeof setting.effect !== 'string' ||
      !LIGHTING_EFFECTS.includes(setting.effect as LightingEffectId) ||
      !isHexColor(setting.primaryColor) ||
      !isHexColor(setting.secondaryColor) ||
      !isByte(setting.brightness) ||
      !isByte(setting.speed)
    ) {
      return null
    }
    return {
      effect: setting.effect as LightingEffectId,
      primaryColor: setting.primaryColor.toLowerCase(),
      secondaryColor: setting.secondaryColor.toLowerCase(),
      brightness: setting.brightness,
      speed: setting.speed,
    }
  })
  return lighting.every((setting) => setting !== null)
    ? (lighting as LightingSettings[])
    : null
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

function isByte(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255
}
