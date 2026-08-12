import { describe, expect, it } from 'vitest'
import {
  VIA_COMMANDS,
  WL_LIGHTING_EFFECTS,
  WlClient,
  decodeViaKeycode,
  encodeViaGetEncoder,
  encodeViaGetKeycode,
  encodeViaSetEncoder,
  encodeViaSetKeycode,
  encodeWlLightingProfile,
  encodeWl,
  isWlPacket,
} from './protocol'

describe('VIA packet encoding', () => {
  it('encodes get and set keycode packets', () => {
    expect([...encodeViaGetKeycode(2, 3, 1).slice(0, 6)]).toEqual([0x04, 2, 3, 1, 0, 0])
    expect([...encodeViaSetKeycode(1, 2, 3, 0x7e41).slice(0, 6)]).toEqual([
      0x05, 1, 2, 3, 0x7e, 0x41,
    ])
  })

  it('encodes encoder direction and preserves 16-bit keycodes', () => {
    expect([...encodeViaGetEncoder(3, 1, true).slice(0, 4)]).toEqual([0x14, 3, 1, 1])
    expect([...encodeViaSetEncoder(0, 0, false, 0xabcd).slice(0, 6)]).toEqual([
      0x15, 0, 0, 0, 0xab, 0xcd,
    ])
  })

  it('decodes VIA big-endian keycodes', () => {
    const response = new Uint8Array(32)
    response.set([VIA_COMMANDS.getKeycode, 1, 2, 3, 0x7e, 0x43])
    expect(decodeViaKeycode(response, VIA_COMMANDS.getKeycode)).toBe(0x7e43)
  })
})

describe('WL protocol', () => {
  it('encodes the WL v1 signature and payload', () => {
    expect([...encodeWl(0x01, 4, 15).slice(0, 8)]).toEqual([
      0xfe, 0x57, 0x4c, 0x01, 0x01, 4, 15, 0,
    ])
  })

  it('recognizes action events', () => {
    const action = encodeWl(0x80, 3)
    expect(isWlPacket(action, 0x80)).toBe(true)
    expect(WlClient.decodeAction(action)).toBe(3)
    action[2] = 0
    expect(WlClient.decodeAction(action)).toBeNull()
  })

  it('exposes the stable profile-lighting effect catalogue', () => {
    expect(Object.keys(WL_LIGHTING_EFFECTS)).toEqual([
      'static',
      'breathing',
      'orbit',
      'wave',
      'twinkle',
    ])
  })

  it('encodes layer lighting as a compact Raw HID packet', () => {
    expect(
      [...encodeWlLightingProfile(1, {
        effect: 'orbit',
        primaryColor: '#ff0000',
        secondaryColor: '#0000ff',
        brightness: 132,
        speed: 104,
      }).slice(0, 13)],
    ).toEqual([0xfe, 0x57, 0x4c, 0x01, 0x03, 1, 2, 0, 255, 132, 170, 255, 104])
  })
})
