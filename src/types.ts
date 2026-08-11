export type TabId = 'layout' | 'profiles' | 'status' | 'diagnostics'

export type EditorTarget =
  | { kind: 'key'; index: number }
  | { kind: 'encoder'; encoder: number; direction: 0 | 1 }

export type StatusId = 0 | 1 | 2 | 3 | 4 | 5

export interface Profile {
  schemaVersion: 1
  id: string
  name: string
  source: string
  createdAt: string
  updatedAt: string
  dirty: boolean
  device: {
    vendorId: number
    productId: number
  }
  layers: number[][]
  encoders: [number, number][][]
  macros: string[]
}

export type ConnectionState = {
  status: 'unsupported' | 'disconnected' | 'connecting' | 'connected' | 'error'
  message: string
  deviceName?: string
}

export interface DeviceDiagnostics {
  viaProtocol: number | null
  wlProtocol: number | null
  layerCount: number | null
  currentStatus: StatusId | null
}

export interface DeviceEvent {
  id: string
  time: string
  type: 'system' | 'success' | 'warning' | 'error' | 'action'
  message: string
}
