import { describe, expect, it } from 'vitest'
import {
  ASSIGNMENT_GROUPS,
  CUSTOM_ACTIONS,
  assignmentLabel,
  formatKeycode,
  parseKeycode,
  toHex,
} from './keycodes'

describe('keycode parsing and round-trip', () => {
  it.each([
    ['KC_A', 0x0004],
    ['G(KC_T)', 0x0817],
    ['LCA(KC_V)', 0x0519],
    ['TO(3)', 0x5203],
    ['MACRO(11)', 0x770b],
    ['0xABCD', 0xabcd],
    ['65535', 0xffff],
  ])('parses %s', (input, expected) => {
    expect(parseKeycode(input)).toBe(expected)
  })

  it('keeps unknown keycodes numeric and round-trippable', () => {
    const unknown = 0xabcd
    expect(formatKeycode(unknown)).toBe('0xABCD')
    expect(parseKeycode(formatKeycode(unknown))).toBe(unknown)
    expect(toHex(unknown)).toBe('0xABCD')
  })

  it('maps the flashed custom action range', () => {
    expect(parseKeycode('WL_PUSH')).toBe(CUSTOM_ACTIONS.WL_PUSH)
    expect(formatKeycode(CUSTOM_ACTIONS.WL_EFFORT_UP)).toBe('WL_EFFORT_UP')
    expect(parseKeycode('WL_SIDE_CHAT')).toBe(0x7e49)
    expect(formatKeycode(0x7e49)).toBe('WL_SIDE_CHAT')
  })

  it('offers verified Codex app actions with friendly labels', () => {
    const codex = ASSIGNMENT_GROUPS.find((group) => group.id === 'codex')
    expect(codex?.items.find((item) => item.label === 'Open side chat')).toMatchObject({
      value: CUSTOM_ACTIONS.WL_SIDE_CHAT,
      shortcut: '⌥⌘S',
    })
    expect(codex?.items.find((item) => item.label === 'Toggle file tree')).toMatchObject({
      value: 0x0a08,
      shortcut: '⇧⌘E',
    })
    expect(assignmentLabel(CUSTOM_ACTIONS.WL_VOICE, 'codex')).toBe('Dictation')
  })

  it('rejects invalid or out-of-range values', () => {
    expect(parseKeycode('0x10000')).toBeNull()
    expect(parseKeycode('TO(40)')).toBeNull()
    expect(parseKeycode('not-a-key')).toBeNull()
  })
})
