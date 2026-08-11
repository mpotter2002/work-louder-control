import { describe, expect, it } from 'vitest'
import { CUSTOM_ACTIONS, formatKeycode, parseKeycode, toHex } from './keycodes'

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
  })

  it('rejects invalid or out-of-range values', () => {
    expect(parseKeycode('0x10000')).toBeNull()
    expect(parseKeycode('TO(40)')).toBeNull()
    expect(parseKeycode('not-a-key')).toBeNull()
  })
})
