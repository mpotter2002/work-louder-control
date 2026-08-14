import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFirmwareProfile,
  createSeedProfile,
  createStoredProfiles,
  exportProfiles,
  importProfiles,
  isProfile,
} from './profiles'
import { formatKeycode } from './keycodes'

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: () => 'test-id' })
})

describe('profile validation', () => {
  it('accepts the seeded archived layout', () => {
    const profile = createSeedProfile()
    expect(isProfile(profile)).toBe(true)
    expect(profile.layers).toHaveLength(4)
    expect(profile.layers[0]).toHaveLength(16)
    expect(profile.encoders[1][1]).toEqual([0x006c, 0x006d])
  })

  it('starts with a profile matching the flashed firmware', () => {
    const [firmware, backup] = createStoredProfiles()
    expect(firmware.name).toBe('Codex Candidate 2')
    expect(firmware.layers[0][3]).toBe(0x7e44)
    expect(firmware.layers[1].map(formatKeycode)).toEqual([
      'WL_SKILLS',
      'CA(F)',
      'WL_MCP',
      'WL_MAINTENANCE',
      'WL_SIDE_CHAT',
      'G(T)',
      'G(N)',
      'WL_PET',
      'WL_SIDE_CHAT',
      'WL_SIDE_CHAT',
      'G(J)',
      'SG(E)',
      'WL_FIGMA',
      'CA(D)',
      'WL_PUSH',
      'TO(0)',
    ])
    expect(firmware.layers[1][14]).toBe(0x7e41)
    expect(firmware.layers[1][13]).toBe(0x0507)
    expect(firmware.encoders[1][1]).toEqual([0x7e42, 0x7e43])
    expect(firmware.lighting[0]).toEqual({
      effect: 'orbit',
      primaryColor: '#ff5a1f',
      secondaryColor: '#ff00a8',
      brightness: 142,
      speed: 74,
    })
    expect(firmware.lighting[1]).toMatchObject({
      effect: 'orbit',
      primaryColor: '#00c8ff',
      secondaryColor: '#ff3b9d',
      brightness: 150,
      speed: 86,
    })
    expect(backup.name).toBe('Creator Micro Backup')
    expect(isProfile(createFirmwareProfile())).toBe(true)
  })

  it('exports and imports a valid profile', () => {
    const exported = exportProfiles([createSeedProfile()])
    const imported = importProfiles(exported)
    expect(imported).toHaveLength(1)
    expect(imported[0].dirty).toBe(true)
    expect(imported[0].device).toEqual({ vendorId: 0x574c, productId: 0xe6e3 })
  })

  it('migrates profile exports created before lighting settings existed', () => {
    const envelope = JSON.parse(exportProfiles([createSeedProfile()]))
    delete envelope.profiles[0].lighting
    const [profile] = importProfiles(JSON.stringify(envelope))
    expect(profile.lighting).toHaveLength(4)
    expect(profile.lighting[1].effect).toBe('orbit')
  })

  it('rejects malformed profile shapes', () => {
    const envelope = JSON.parse(exportProfiles([createSeedProfile()]))
    envelope.profiles[0].layers[0].pop()
    expect(() => importProfiles(JSON.stringify(envelope))).toThrow('invalid layout data')
  })

  it('rejects unrelated JSON', () => {
    expect(() => importProfiles('{"hello":"world"}')).toThrow('not a Work Louder Control')
    expect(() => importProfiles('{oops')).toThrow('not valid JSON')
  })
})
