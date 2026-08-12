import type { LightingEffectId, LightingSettings, StatusId } from '../types'

export const REPORT_SIZE = 32
export const VIA_PROTOCOL_VERSION = 0x000d
export const RAW_USAGE_PAGE = 0xff60
export const RAW_USAGE = 0x61
export const DEVICE_FILTER = {
  vendorId: 0x574c,
  productId: 0xe6e3,
  usagePage: RAW_USAGE_PAGE,
  usage: RAW_USAGE,
} as const

export const VIA_COMMANDS = {
  protocolVersion: 0x01,
  getKeycode: 0x04,
  setKeycode: 0x05,
  layerCount: 0x11,
  getEncoder: 0x14,
  setEncoder: 0x15,
} as const

const WL_ID = 0xfe
const WL_VERSION = 0x01
const WL_SET_STATUS = 0x01
const WL_PING = 0x02
const WL_SET_LIGHTING_PROFILE = 0x03
const WL_SET_SLOT_STATUS = 0x04
const WL_GET_LIGHTING_CAPABILITIES = 0x05
const WL_ACTION = 0x80

const WL_LIGHTING_EFFECT_IDS: Record<LightingEffectId, number> = {
  static: 0,
  breathing: 1,
  orbit: 2,
  wave: 3,
  twinkle: 4,
}

export const WL_LIGHTING_EFFECTS: Record<
  LightingEffectId,
  { id: LightingEffectId; label: string; description: string }
> = {
  static: { id: 'static', label: 'Static gradient', description: 'A two-color still light' },
  breathing: { id: 'breathing', label: 'Breathing', description: 'A soft color pulse' },
  orbit: { id: 'orbit', label: 'Orbit', description: 'A rotating highlight around the pad' },
  wave: { id: 'wave', label: 'Wave', description: 'A moving ribbon across the controls' },
  twinkle: { id: 'twinkle', label: 'Twinkle', description: 'Independent soft flashes' },
}

export type LightingCapabilities = {
  profileLighting: boolean
  profileCount: number
  effectCount: number
}

export const WL_STATUSES: Record<
  StatusId,
  { id: StatusId; label: string; description: string; color: string }
> = {
  0: { id: 0, label: 'None', description: 'Breathing pulse only', color: '#3b484f' },
  1: { id: 1, label: 'Idle', description: 'Ready and waiting', color: '#969696' },
  2: { id: 2, label: 'Working', description: 'Agent is thinking', color: '#0050ff' },
  3: { id: 3, label: 'Needs input', description: 'Waiting for a response', color: '#ffaa00' },
  4: { id: 4, label: 'Complete', description: 'Task finished successfully', color: '#00ff46' },
  5: { id: 5, label: 'Error', description: 'Task failed or is blocked', color: '#ff005a' },
}

export const WL_SLOT_COUNT = 2

export const WL_SLOT_LABELS = ['Thread 1', 'Thread 2'] as const

export const WL_ACTIONS: Record<number, string> = {
  1: 'Push',
  2: 'Effort down',
  3: 'Effort up',
}

export function packet(...bytes: number[]) {
  const result = new Uint8Array(REPORT_SIZE)
  result.set(bytes.slice(0, REPORT_SIZE))
  return result
}

export function encodeViaGetKeycode(layer: number, row: number, column: number) {
  return packet(VIA_COMMANDS.getKeycode, layer, row, column)
}

export function encodeViaSetKeycode(
  layer: number,
  row: number,
  column: number,
  keycode: number,
) {
  return packet(VIA_COMMANDS.setKeycode, layer, row, column, keycode >> 8, keycode & 0xff)
}

export function encodeViaGetEncoder(layer: number, encoder: number, clockwise: boolean) {
  return packet(VIA_COMMANDS.getEncoder, layer, encoder, clockwise ? 1 : 0)
}

export function encodeViaSetEncoder(
  layer: number,
  encoder: number,
  clockwise: boolean,
  keycode: number,
) {
  return packet(
    VIA_COMMANDS.setEncoder,
    layer,
    encoder,
    clockwise ? 1 : 0,
    keycode >> 8,
    keycode & 0xff,
  )
}

export function decodeViaKeycode(response: Uint8Array, expectedCommand: number) {
  if (response.length < 6 || response[0] !== expectedCommand) {
    throw new Error('Unexpected VIA keycode response')
  }
  return (response[4] << 8) | response[5]
}

export function encodeWl(command: number, ...payload: number[]) {
  return packet(WL_ID, 0x57, 0x4c, WL_VERSION, command, ...payload)
}

export function encodeWlLightingProfile(layer: number, settings: LightingSettings) {
  const primary = hexToHsv(settings.primaryColor)
  const secondary = hexToHsv(settings.secondaryColor)
  return encodeWl(
    WL_SET_LIGHTING_PROFILE,
    layer,
    WL_LIGHTING_EFFECT_IDS[settings.effect],
    primary.hue,
    primary.saturation,
    clampByte(settings.brightness),
    secondary.hue,
    secondary.saturation,
    clampByte(settings.speed),
  )
}

export function isWlPacket(data: Uint8Array, command?: number) {
  return (
    data.length >= 6 &&
    data[0] === WL_ID &&
    data[1] === 0x57 &&
    data[2] === 0x4c &&
    data[3] === WL_VERSION &&
    (command === undefined || data[4] === command)
  )
}

type PendingResponse = {
  predicate: (packet: Uint8Array) => boolean
  resolve: (packet: Uint8Array) => void
  reject: (error: Error) => void
  timer: number
}

export class HIDTransport {
  readonly device: HIDDevice
  private readonly timeoutMs: number
  private pending: PendingResponse[] = []
  private eventHandler: ((packet: Uint8Array) => void) | null = null

  constructor(device: HIDDevice, timeoutMs = 1500) {
    this.device = device
    this.timeoutMs = timeoutMs
  }

  setEventHandler(handler: (packet: Uint8Array) => void) {
    this.eventHandler = handler
  }

  private handleInput = (event: HIDInputReportEvent) => {
    const data = new Uint8Array(
      event.data.buffer,
      event.data.byteOffset,
      event.data.byteLength,
    ).slice()
    const index = this.pending.findIndex((pending) => pending.predicate(data))
    if (index >= 0) {
      const [pending] = this.pending.splice(index, 1)
      window.clearTimeout(pending.timer)
      pending.resolve(data)
      return
    }
    this.eventHandler?.(data)
  }

  async open() {
    if (!this.device.opened) await this.device.open()
    this.device.addEventListener('inputreport', this.handleInput)
  }

  async close() {
    this.device.removeEventListener('inputreport', this.handleInput)
    this.pending.forEach((pending) => {
      window.clearTimeout(pending.timer)
      pending.reject(new Error('Device disconnected'))
    })
    this.pending = []
    if (this.device.opened) await this.device.close()
  }

  async request(data: Uint8Array, predicate: (response: Uint8Array) => boolean) {
    const response = new Promise<Uint8Array>((resolve, reject) => {
      const pending: PendingResponse = {
        predicate,
        resolve,
        reject,
        timer: window.setTimeout(() => {
          this.pending = this.pending.filter((item) => item !== pending)
          reject(new Error('Device response timed out'))
        }, this.timeoutMs),
      }
      this.pending.push(pending)
    })
    try {
      await this.device.sendReport(0, data.slice().buffer)
    } catch (error) {
      const pending = this.pending.find((item) => item.predicate === predicate)
      if (pending) {
        window.clearTimeout(pending.timer)
        this.pending = this.pending.filter((item) => item !== pending)
      }
      throw error
    }
    return response
  }
}

export class ViaClient {
  private transport: HIDTransport

  constructor(transport: HIDTransport) {
    this.transport = transport
  }

  private command(data: Uint8Array, command: number) {
    return this.transport.request(data, (response) => response[0] === command)
  }

  async getProtocolVersion() {
    const response = await this.command(packet(VIA_COMMANDS.protocolVersion), VIA_COMMANDS.protocolVersion)
    return (response[1] << 8) | response[2]
  }

  async getLayerCount() {
    const response = await this.command(packet(VIA_COMMANDS.layerCount), VIA_COMMANDS.layerCount)
    return response[1]
  }

  async getKeycode(layer: number, row: number, column: number) {
    const response = await this.command(
      encodeViaGetKeycode(layer, row, column),
      VIA_COMMANDS.getKeycode,
    )
    return decodeViaKeycode(response, VIA_COMMANDS.getKeycode)
  }

  async setKeycode(layer: number, row: number, column: number, keycode: number) {
    await this.command(
      encodeViaSetKeycode(layer, row, column, keycode),
      VIA_COMMANDS.setKeycode,
    )
  }

  async getEncoder(layer: number, encoder: number, clockwise: boolean) {
    const response = await this.command(
      encodeViaGetEncoder(layer, encoder, clockwise),
      VIA_COMMANDS.getEncoder,
    )
    return decodeViaKeycode(response, VIA_COMMANDS.getEncoder)
  }

  async setEncoder(layer: number, encoder: number, clockwise: boolean, keycode: number) {
    await this.command(
      encodeViaSetEncoder(layer, encoder, clockwise, keycode),
      VIA_COMMANDS.setEncoder,
    )
  }
}

export class WlClient {
  private transport: HIDTransport

  constructor(transport: HIDTransport) {
    this.transport = transport
  }

  async ping(): Promise<StatusId> {
    const response = await this.transport.request(
      encodeWl(WL_PING),
      (packet) => isWlPacket(packet, WL_PING),
    )
    return normalizeStatus(response[5])
  }

  async setStatus(status: StatusId, ttl: number): Promise<StatusId> {
    const response = await this.transport.request(
      encodeWl(WL_SET_STATUS, status, Math.max(0, Math.min(255, ttl))),
      (packet) => isWlPacket(packet, WL_SET_STATUS),
    )
    return normalizeStatus(response[7])
  }

  async setSlotStatus(slot: number, status: StatusId, ttl: number) {
    const response = await this.transport.request(
      encodeWl(WL_SET_SLOT_STATUS, slot, status, Math.max(0, Math.min(255, ttl))),
      (packet) => isWlPacket(packet) && (packet[4] === WL_SET_SLOT_STATUS || packet[4] === 0xff),
    )
    if (response[4] !== WL_SET_SLOT_STATUS) {
      throw new Error('Device rejected the thread indicator slot')
    }
    return normalizeStatus(response[7])
  }

  async getLightingCapabilities(): Promise<LightingCapabilities | null> {
    const response = await this.transport.request(
      encodeWl(WL_GET_LIGHTING_CAPABILITIES),
      (packet) =>
        isWlPacket(packet) &&
        (packet[4] === WL_GET_LIGHTING_CAPABILITIES || packet[4] === 0xff),
    )
    if (response[4] !== WL_GET_LIGHTING_CAPABILITIES || response[5] !== 1) return null
    return {
      profileLighting: true,
      effectCount: response[6],
      profileCount: response[7],
    }
  }

  async setLightingProfile(layer: number, settings: LightingSettings) {
    const response = await this.transport.request(
      encodeWlLightingProfile(layer, settings),
      (packet) => isWlPacket(packet, WL_SET_LIGHTING_PROFILE),
    )
    if (response[5] !== layer || response[6] !== WL_LIGHTING_EFFECT_IDS[settings.effect]) {
      throw new Error('Device rejected the lighting profile')
    }
  }

  static decodeAction(data: Uint8Array) {
    return isWlPacket(data, WL_ACTION) && data[5] in WL_ACTIONS ? data[5] : null
  }
}

function normalizeStatus(value: number): StatusId {
  return value >= 0 && value <= 5 ? (value as StatusId) : 0
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function hexToHsv(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16)
  const red = ((value >> 16) & 0xff) / 255
  const green = ((value >> 8) & 0xff) / 255
  const blue = (value & 0xff) / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const delta = maximum - minimum
  let hue = 0

  if (delta !== 0) {
    if (maximum === red) hue = ((green - blue) / delta) % 6
    else if (maximum === green) hue = (blue - red) / delta + 2
    else hue = (red - green) / delta + 4
    hue *= 60
    if (hue < 0) hue += 360
  }

  return {
    hue: clampByte((hue / 360) * 255),
    saturation: maximum === 0 ? 0 : clampByte((delta / maximum) * 255),
  }
}
