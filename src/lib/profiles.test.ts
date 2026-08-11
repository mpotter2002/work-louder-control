import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFirmwareProfile,
  createSeedProfile,
  createStoredProfiles,
  exportProfiles,
  importProfiles,
  isProfile,
} from './profiles'

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
    expect(firmware.name).toBe('Codex Candidate 1')
    expect(firmware.layers[0][3]).toBe(0x7e47)
    expect(firmware.layers[1][2]).toBe(0x7e44)
    expect(firmware.encoders[1][1]).toEqual([0x7e45, 0x7e46])
    expect(firmware.lighting[1]).toMatchObject({
      effect: 'breathing',
      primaryColor: '#14b8ff',
      secondaryColor: '#8b5cf6',
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
    expect(profile.lighting[1].effect).toBe('breathing')
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
