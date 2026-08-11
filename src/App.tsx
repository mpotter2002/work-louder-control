import {
  Activity,
  AlertCircle,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Download,
  Gauge,
  GitFork,
  Keyboard,
  Layers3,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  SlidersHorizontal,
  Trash2,
  Unplug,
  Upload,
  Usb,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  ASSIGNMENT_GROUPS,
  formatKeycode,
  keycodeDescription,
  parseKeycode,
  toHex,
} from './lib/keycodes'
import {
  createFirmwareProfile,
  createStoredProfiles,
  duplicateProfile,
  exportProfiles,
  importProfiles,
  loadProfiles,
  saveProfiles,
} from './lib/profiles'
import {
  DEVICE_FILTER,
  HIDTransport,
  VIA_PROTOCOL_VERSION,
  ViaClient,
  WL_ACTIONS,
  WL_STATUSES,
  WlClient,
} from './lib/protocol'
import type {
  ConnectionState,
  DeviceDiagnostics,
  DeviceEvent,
  EditorTarget,
  Profile,
  StatusId,
  TabId,
} from './types'

const TABS: { id: TabId; label: string; icon: typeof Keyboard }[] = [
  { id: 'layout', label: 'Layout', icon: Keyboard },
  { id: 'profiles', label: 'Profiles', icon: Layers3 },
  { id: 'status', label: 'Status', icon: Zap },
  { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
]

const LAYER_NAMES = ['Figma', 'Codex', 'PC', 'Extra']
const REPORT_TIMEOUT_MS = 1800

function nowLabel() {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date())
}

function App() {
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    const stored = loadProfiles()
    return stored.length ? stored : createStoredProfiles()
  })
  const [activeProfileId, setActiveProfileId] = useState(() => profiles[0]?.id ?? '')
  const [activeLayer, setActiveLayer] = useState(0)
  const [tab, setTab] = useState<TabId>('layout')
  const [selected, setSelected] = useState<EditorTarget>({ kind: 'key', index: 0 })
  const [connection, setConnection] = useState<ConnectionState>({
    status: 'disconnected',
    message: 'No device connected',
  })
  const [diagnostics, setDiagnostics] = useState<DeviceDiagnostics>({
    viaProtocol: null,
    wlProtocol: null,
    layerCount: null,
    currentStatus: null,
  })
  const [events, setEvents] = useState<DeviceEvent[]>([
    { id: crypto.randomUUID(), time: nowLabel(), type: 'system', message: 'Configurator ready' },
  ])
  const [busy, setBusy] = useState<{ label: string; progress: number } | null>(null)
  const [confirmApply, setConfirmApply] = useState(false)
  const [ttl, setTtl] = useState(15)
  const [statusError, setStatusError] = useState('')
  const transportRef = useRef<HIDTransport | null>(null)
  const viaRef = useRef<ViaClient | null>(null)
  const wlRef = useRef<WlClient | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0]

  const addEvent = (type: DeviceEvent['type'], message: string) => {
    setEvents((current) =>
      [
        { id: crypto.randomUUID(), time: nowLabel(), type, message },
        ...current,
      ].slice(0, 80),
    )
  }

  useEffect(() => {
    saveProfiles(profiles)
  }, [profiles])

  useEffect(() => {
    if (!activeProfile && profiles[0]) setActiveProfileId(profiles[0].id)
  }, [activeProfile, profiles])

  useEffect(() => {
    if (!('hid' in navigator)) {
      setConnection({
        status: 'unsupported',
        message: 'WebHID requires Chrome or Edge on desktop',
      })
      return
    }

    const handleConnect = (event: HIDConnectionEvent) => {
      if (
        event.device.vendorId === DEVICE_FILTER.vendorId &&
        event.device.productId === DEVICE_FILTER.productId
      ) {
        void connectDevice(event.device, true)
      }
    }
    const handleDisconnect = (event: HIDConnectionEvent) => {
      if (transportRef.current?.device === event.device) {
        transportRef.current?.close()
        transportRef.current = null
        viaRef.current = null
        wlRef.current = null
        setConnection({ status: 'disconnected', message: 'Device disconnected' })
        addEvent('warning', 'Micro Pad disconnected')
      }
    }

    navigator.hid.addEventListener('connect', handleConnect)
    navigator.hid.addEventListener('disconnect', handleDisconnect)
    void navigator.hid.getDevices().then((devices) => {
      const authorized = devices.find(
        (device) =>
          device.vendorId === DEVICE_FILTER.vendorId &&
          device.productId === DEVICE_FILTER.productId,
      )
      if (authorized) void connectDevice(authorized, true)
    })

    return () => {
      navigator.hid.removeEventListener('connect', handleConnect)
      navigator.hid.removeEventListener('disconnect', handleDisconnect)
      transportRef.current?.close()
    }
  }, [])

  async function connectDevice(device?: HIDDevice, automatic = false) {
    if (!('hid' in navigator)) return
    setConnection({
      status: 'connecting',
      message: automatic ? 'Reconnecting to authorized device' : 'Waiting for device permission',
    })
    try {
      const chosen =
        device ??
        (
          await navigator.hid.requestDevice({
            filters: [DEVICE_FILTER],
          })
        )[0]
      if (!chosen) {
        setConnection({ status: 'disconnected', message: 'Connection canceled' })
        return
      }
      const transport = new HIDTransport(chosen, REPORT_TIMEOUT_MS)
      transport.setEventHandler((packet) => {
        const action = WlClient.decodeAction(packet)
        if (action) addEvent('action', `Device action: ${WL_ACTIONS[action]}`)
      })
      await transport.open()
      transportRef.current = transport
      viaRef.current = new ViaClient(transport)
      wlRef.current = new WlClient(transport)
      setConnection({
        status: 'connected',
        message: chosen.productName || 'Work Louder Micro Pad',
        deviceName: chosen.productName || 'Micro Pad',
      })
      addEvent('success', `${automatic ? 'Reconnected to' : 'Connected to'} Micro Pad`)
      await refreshDiagnostics()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to connect'
      setConnection({ status: 'error', message })
      addEvent('error', `Connection failed: ${message}`)
    }
  }

  async function refreshDiagnostics() {
    const via = viaRef.current
    const wl = wlRef.current
    if (!via || !wl) return
    try {
      const [viaProtocol, layerCount, currentStatus] = await Promise.all([
        via.getProtocolVersion(),
        via.getLayerCount(),
        wl.ping(),
      ])
      setDiagnostics({
        viaProtocol,
        wlProtocol: 1,
        layerCount,
        currentStatus,
      })
      addEvent('success', `Handshake complete: VIA 0x${viaProtocol.toString(16).padStart(4, '0')}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Handshake failed'
      addEvent('error', message)
      setConnection((current) => ({ ...current, status: 'error', message }))
    }
  }

  function updateProfile(mutator: (profile: Profile) => Profile) {
    if (!activeProfile) return
    setProfiles((current) =>
      current.map((profile) =>
        profile.id === activeProfile.id
          ? { ...mutator(profile), updatedAt: new Date().toISOString(), dirty: true }
          : profile,
      ),
    )
  }

  function selectedKeycode() {
    if (!activeProfile) return 0
    if (selected.kind === 'key') return activeProfile.layers[activeLayer][selected.index]
    return activeProfile.encoders[activeLayer][selected.encoder][selected.direction]
  }

  function assignKeycode(keycode: number) {
    updateProfile((profile) => {
      if (selected.kind === 'key') {
        const layers = profile.layers.map((layer) => [...layer])
        layers[activeLayer][selected.index] = keycode
        return { ...profile, layers }
      }
      const encoders = profile.encoders.map((layer) =>
        layer.map((encoder) => [...encoder] as [number, number]),
      )
      encoders[activeLayer][selected.encoder][selected.direction] = keycode
      return { ...profile, encoders }
    })
  }

  async function readFromDevice() {
    if (!viaRef.current || !activeProfile) return
    setBusy({ label: 'Reading layout', progress: 0 })
    try {
      const layerCount = await viaRef.current.getLayerCount()
      const layers: number[][] = []
      const encoders: [number, number][][] = []
      const total = layerCount * 20
      let complete = 0
      for (let layer = 0; layer < layerCount; layer += 1) {
        const keys: number[] = []
        for (let index = 0; index < 16; index += 1) {
          keys.push(await viaRef.current.getKeycode(layer, Math.floor(index / 4), index % 4))
          complete += 1
          setBusy({ label: 'Reading layout', progress: Math.round((complete / total) * 100) })
        }
        layers.push(keys)
        const layerEncoders: [number, number][] = []
        for (let encoder = 0; encoder < 2; encoder += 1) {
          const ccw = await viaRef.current.getEncoder(layer, encoder, false)
          const cw = await viaRef.current.getEncoder(layer, encoder, true)
          layerEncoders.push([ccw, cw])
          complete += 2
          setBusy({ label: 'Reading layout', progress: Math.round((complete / total) * 100) })
        }
        encoders.push(layerEncoders)
      }
      setProfiles((current) =>
        current.map((profile) =>
          profile.id === activeProfile.id
            ? {
                ...profile,
                layers,
                encoders,
                dirty: true,
                updatedAt: new Date().toISOString(),
              }
            : profile,
        ),
      )
      setDiagnostics((current) => ({ ...current, layerCount }))
      addEvent('success', `Read ${layerCount} layers from device`)
    } catch (error) {
      addEvent('error', error instanceof Error ? error.message : 'Device read failed')
    } finally {
      setBusy(null)
    }
  }

  async function applyToDevice() {
    if (!viaRef.current || !activeProfile) return
    setConfirmApply(false)
    setBusy({ label: 'Applying profile', progress: 0 })
    try {
      const deviceLayerCount = await viaRef.current.getLayerCount()
      if (deviceLayerCount !== activeProfile.layers.length) {
        throw new Error(
          `Profile has ${activeProfile.layers.length} layers; device reports ${deviceLayerCount}`,
        )
      }
      const total = deviceLayerCount * 20
      let complete = 0
      for (let layer = 0; layer < deviceLayerCount; layer += 1) {
        for (let index = 0; index < 16; index += 1) {
          await viaRef.current.setKeycode(
            layer,
            Math.floor(index / 4),
            index % 4,
            activeProfile.layers[layer][index],
          )
          complete += 1
          setBusy({ label: 'Applying profile', progress: Math.round((complete / total) * 100) })
        }
        for (let encoder = 0; encoder < 2; encoder += 1) {
          await viaRef.current.setEncoder(
            layer,
            encoder,
            false,
            activeProfile.encoders[layer][encoder][0],
          )
          await viaRef.current.setEncoder(
            layer,
            encoder,
            true,
            activeProfile.encoders[layer][encoder][1],
          )
          complete += 2
          setBusy({ label: 'Applying profile', progress: Math.round((complete / total) * 100) })
        }
      }
      setProfiles((current) =>
        current.map((profile) =>
          profile.id === activeProfile.id ? { ...profile, dirty: false } : profile,
        ),
      )
      addEvent('success', `Applied “${activeProfile.name}” to device`)
    } catch (error) {
      addEvent('error', error instanceof Error ? error.message : 'Profile apply failed')
    } finally {
      setBusy(null)
    }
  }

  async function testStatus(status: StatusId) {
    if (!wlRef.current) return
    setStatusError('')
    try {
      const accepted = await wlRef.current.setStatus(status, ttl)
      setDiagnostics((current) => ({ ...current, currentStatus: accepted }))
      addEvent('success', `Status set to ${WL_STATUSES[accepted].label}${ttl ? ` for ${ttl}s` : ''}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Status command failed'
      setStatusError(message)
      addEvent('error', message)
    }
  }

  function handleExport(profileOnly = true) {
    const data = exportProfiles(profileOnly && activeProfile ? [activeProfile] : profiles)
    const blob = new Blob([data], { type: 'application/json' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = profileOnly
      ? `${activeProfile?.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'profile'}.json`
      : 'work-louder-profiles.json'
    anchor.click()
    URL.revokeObjectURL(href)
    addEvent('system', `Exported ${profileOnly ? 'profile' : 'profile library'}`)
  }

  async function handleImport(file: File) {
    try {
      const imported = importProfiles(await file.text())
      setProfiles((current) => [...current, ...imported])
      setActiveProfileId(imported[0].id)
      addEvent('success', `Imported ${imported.length} profile${imported.length === 1 ? '' : 's'}`)
    } catch (error) {
      addEvent('error', error instanceof Error ? error.message : 'Import failed')
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }

  const canUseDevice = connection.status === 'connected'

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>Work Louder Control</strong>
            <span>Micro Pad</span>
          </div>
        </div>

        <div className={`connection-summary ${connection.status}`}>
          <span className="connection-dot" />
          <div>
            <strong>{connection.status === 'connected' ? 'Connected' : 'Device offline'}</strong>
            <span>{connection.message}</span>
          </div>
        </div>

        <button
          className={canUseDevice ? 'button secondary' : 'button primary'}
          type="button"
          onClick={() => void connectDevice()}
          disabled={connection.status === 'connecting' || connection.status === 'unsupported'}
        >
          {connection.status === 'connecting' ? (
            <LoaderCircle className="spin" size={17} />
          ) : canUseDevice ? (
            <RefreshCw size={17} />
          ) : (
            <Usb size={17} />
          )}
          {canUseDevice ? 'Reconnect' : 'Connect'}
        </button>
      </header>

      <nav className="main-tabs" aria-label="Configurator sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            type="button"
            onClick={() => setTab(id)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>

      {connection.status === 'unsupported' && (
        <div className="capability-banner">
          <CircleHelp size={18} />
          <span>
            WebHID is unavailable in this browser. Profile editing still works; connect with Chrome
            or Edge on desktop to read or write the pad.
          </span>
        </div>
      )}

      <main>
        {tab === 'layout' && activeProfile && (
          <LayoutView
            profile={activeProfile}
            activeLayer={activeLayer}
            selected={selected}
            selectedKeycode={selectedKeycode()}
            setActiveLayer={setActiveLayer}
            setSelected={setSelected}
            assignKeycode={assignKeycode}
            updateName={(name) => updateProfile((profile) => ({ ...profile, name }))}
            onRead={() => void readFromDevice()}
            onApply={() => setConfirmApply(true)}
            canUseDevice={canUseDevice}
          />
        )}

        {tab === 'profiles' && activeProfile && (
          <ProfilesView
            profiles={profiles}
            activeProfile={activeProfile}
            onSelect={setActiveProfileId}
            onNew={() => {
              const profile = createFirmwareProfile(`Profile ${profiles.length + 1}`)
              setProfiles((current) => [...current, profile])
              setActiveProfileId(profile.id)
            }}
            onDuplicate={() => {
              const copy = duplicateProfile(activeProfile)
              setProfiles((current) => [...current, copy])
              setActiveProfileId(copy.id)
            }}
            onDelete={() => {
              if (profiles.length === 1) return
              setProfiles((current) => current.filter((profile) => profile.id !== activeProfile.id))
              setActiveProfileId(profiles.find((profile) => profile.id !== activeProfile.id)?.id ?? '')
            }}
            onExport={handleExport}
            onImport={() => importRef.current?.click()}
            onApply={() => setConfirmApply(true)}
            canUseDevice={canUseDevice}
          />
        )}

        {tab === 'status' && (
          <StatusView
            ttl={ttl}
            setTtl={setTtl}
            currentStatus={diagnostics.currentStatus}
            onTest={(status) => void testStatus(status)}
            canUseDevice={canUseDevice}
            error={statusError}
          />
        )}

        {tab === 'diagnostics' && (
          <DiagnosticsView
            connection={connection}
            diagnostics={diagnostics}
            events={events}
            onRefresh={() => void refreshDiagnostics()}
            onClear={() => setEvents([])}
            canUseDevice={canUseDevice}
          />
        )}
      </main>

      <input
        ref={importRef}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handleImport(file)
        }}
      />

      {busy && (
        <div className="busy-overlay" role="status">
          <div className="busy-panel">
            <LoaderCircle className="spin" size={22} />
            <div>
              <strong>{busy.label}</strong>
              <span>{busy.progress}%</span>
            </div>
            <div className="progress-track">
              <span style={{ width: `${busy.progress}%` }} />
            </div>
          </div>
        </div>
      )}

      {confirmApply && activeProfile && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="apply-title">
            <div className="modal-icon">
              <Save size={20} />
            </div>
            <h2 id="apply-title">Apply profile to device?</h2>
            <p>
              This writes all key and encoder assignments from “{activeProfile.name}” to the pad’s
              dynamic keymap. Firmware is not erased or reflashed.
            </p>
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={() => setConfirmApply(false)}>
                Cancel
              </button>
              <button className="button primary" type="button" onClick={() => void applyToDevice()}>
                <Save size={16} />
                Apply profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LayoutView({
  profile,
  activeLayer,
  selected,
  selectedKeycode,
  setActiveLayer,
  setSelected,
  assignKeycode,
  updateName,
  onRead,
  onApply,
  canUseDevice,
}: {
  profile: Profile
  activeLayer: number
  selected: EditorTarget
  selectedKeycode: number
  setActiveLayer: (layer: number) => void
  setSelected: (target: EditorTarget) => void
  assignKeycode: (keycode: number) => void
  updateName: (name: string) => void
  onRead: () => void
  onApply: () => void
  canUseDevice: boolean
}) {
  return (
    <div className="layout-workspace">
      <section className="board-section">
        <div className="section-toolbar">
          <div className="profile-title">
            <input
              aria-label="Profile name"
              value={profile.name}
              onChange={(event) => updateName(event.target.value)}
            />
            {profile.dirty && <span className="dirty-pill">Unsaved to device</span>}
          </div>
          <div className="toolbar-actions">
            <button
              className="icon-button"
              type="button"
              title="Read layout from device"
              onClick={onRead}
              disabled={!canUseDevice}
            >
              <Download size={17} />
            </button>
            <button className="button primary compact" type="button" onClick={onApply} disabled={!canUseDevice}>
              <Save size={16} />
              Apply
            </button>
          </div>
        </div>

        <div className="layer-switcher" role="tablist" aria-label="Layers">
          {profile.layers.map((_, index) => (
            <button
              key={index}
              role="tab"
              aria-selected={activeLayer === index}
              className={activeLayer === index ? 'active' : ''}
              type="button"
              onClick={() => setActiveLayer(index)}
            >
              <span>{index}</span>
              {LAYER_NAMES[index] ?? `Layer ${index}`}
            </button>
          ))}
        </div>

        <MicroBoard
          keycodes={profile.layers[activeLayer]}
          encoders={profile.encoders[activeLayer]}
          selected={selected}
          setSelected={setSelected}
        />
      </section>

      <AssignmentPanel
        selected={selected}
        keycode={selectedKeycode}
        assignKeycode={assignKeycode}
      />
    </div>
  )
}

function MicroBoard({
  keycodes,
  encoders,
  selected,
  setSelected,
}: {
  keycodes: number[]
  encoders: [number, number][]
  selected: EditorTarget
  setSelected: (target: EditorTarget) => void
}) {
  return (
    <div className="device-stage">
      <div className="device-label">
        <span>CREATOR</span>
        <strong>MICRO</strong>
      </div>
      <div className="encoder-row">
        {encoders.map((encoder, index) => (
          <div className="encoder-control" key={index}>
            <button
              type="button"
              className={
                selected.kind === 'encoder' &&
                selected.encoder === index &&
                selected.direction === 0
                  ? 'selected'
                  : ''
              }
              onClick={() => setSelected({ kind: 'encoder', encoder: index, direction: 0 })}
              title={`Encoder ${index + 1} counterclockwise`}
            >
              <RotateCcw size={15} />
              <span>{formatKeycode(encoder[0])}</span>
            </button>
            <div className="encoder-knob" aria-hidden="true">
              <span />
            </div>
            <button
              type="button"
              className={
                selected.kind === 'encoder' &&
                selected.encoder === index &&
                selected.direction === 1
                  ? 'selected'
                  : ''
              }
              onClick={() => setSelected({ kind: 'encoder', encoder: index, direction: 1 })}
              title={`Encoder ${index + 1} clockwise`}
            >
              <RotateCw size={15} />
              <span>{formatKeycode(encoder[1])}</span>
            </button>
          </div>
        ))}
      </div>
      <div className="key-grid">
        {keycodes.map((keycode, index) => (
          <button
            key={index}
            type="button"
            className={selected.kind === 'key' && selected.index === index ? 'key selected' : 'key'}
            onClick={() => setSelected({ kind: 'key', index })}
            title={`Row ${Math.floor(index / 4) + 1}, column ${(index % 4) + 1}: ${keycodeDescription(keycode)}`}
          >
            <span>{formatKeycode(keycode)}</span>
            <small>{Math.floor(index / 4) + 1}.{(index % 4) + 1}</small>
          </button>
        ))}
      </div>
    </div>
  )
}

function AssignmentPanel({
  selected,
  keycode,
  assignKeycode,
}: {
  selected: EditorTarget
  keycode: number
  assignKeycode: (keycode: number) => void
}) {
  const [group, setGroup] = useState(ASSIGNMENT_GROUPS[0].id)
  const [query, setQuery] = useState('')
  const [numeric, setNumeric] = useState(toHex(keycode))
  const activeGroup = ASSIGNMENT_GROUPS.find((item) => item.id === group) ?? ASSIGNMENT_GROUPS[0]

  useEffect(() => setNumeric(toHex(keycode)), [keycode])

  const options = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return activeGroup.items.filter(
      (item) =>
        !normalized ||
        item.label.toLowerCase().includes(normalized) ||
        item.code.toLowerCase().includes(normalized),
    )
  }, [activeGroup, query])

  return (
    <aside className="assignment-panel">
      <div className="panel-heading">
        <div>
          <span>Selected control</span>
          <h2>
            {selected.kind === 'key'
              ? `Key ${Math.floor(selected.index / 4) + 1}.${(selected.index % 4) + 1}`
              : `Encoder ${selected.encoder + 1} ${selected.direction ? 'clockwise' : 'counterclockwise'}`}
          </h2>
        </div>
        <div className="keycode-badge">{toHex(keycode)}</div>
      </div>

      <div className="current-assignment">
        <span>Current assignment</span>
        <strong>{formatKeycode(keycode)}</strong>
        <small>{keycodeDescription(keycode)}</small>
      </div>

      <label className="search-field">
        <SlidersHorizontal size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter assignments"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} title="Clear filter">
            <X size={14} />
          </button>
        )}
      </label>

      <div className="assignment-groups" role="tablist" aria-label="Assignment categories">
        {ASSIGNMENT_GROUPS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={group === item.id ? 'active' : ''}
            onClick={() => setGroup(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="assignment-list">
        {options.map((option) => (
          <button
            key={option.code}
            type="button"
            className={option.value === keycode ? 'active' : ''}
            onClick={() => assignKeycode(option.value)}
          >
            <span>
              <strong>{option.label}</strong>
              <small>{option.code}</small>
            </span>
            {option.value === keycode && <Check size={16} />}
          </button>
        ))}
      </div>

      <form
        className="numeric-editor"
        onSubmit={(event) => {
          event.preventDefault()
          const parsed = parseKeycode(numeric)
          if (parsed !== null) assignKeycode(parsed)
        }}
      >
        <label>
          Numeric keycode
          <span className="help-tip" title="Unknown and custom 16-bit keycodes are preserved exactly">
            <CircleHelp size={14} />
          </span>
        </label>
        <div>
          <input
            value={numeric}
            onChange={(event) => setNumeric(event.target.value)}
            aria-label="Numeric keycode"
          />
          <button className="button secondary compact" type="submit">
            Set
          </button>
        </div>
      </form>
    </aside>
  )
}

function ProfilesView({
  profiles,
  activeProfile,
  onSelect,
  onNew,
  onDuplicate,
  onDelete,
  onExport,
  onImport,
  onApply,
  canUseDevice,
}: {
  profiles: Profile[]
  activeProfile: Profile
  onSelect: (id: string) => void
  onNew: () => void
  onDuplicate: () => void
  onDelete: () => void
  onExport: (profileOnly?: boolean) => void
  onImport: () => void
  onApply: () => void
  canUseDevice: boolean
}) {
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <span>Local library</span>
          <h1>Profiles</h1>
        </div>
        <div className="toolbar-actions">
          <button className="button secondary" type="button" onClick={onImport}>
            <Upload size={16} />
            Import
          </button>
          <button className="button primary" type="button" onClick={onNew}>
            <Plus size={16} />
            New profile
          </button>
        </div>
      </div>

      <div className="profiles-layout">
        <div className="profile-list">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className={profile.id === activeProfile.id ? 'profile-row active' : 'profile-row'}
              onClick={() => onSelect(profile.id)}
            >
              <div className="profile-avatar">{profile.name.slice(0, 2).toUpperCase()}</div>
              <span>
                <strong>{profile.name}</strong>
                <small>{profile.layers.length} layers · Updated {new Date(profile.updatedAt).toLocaleDateString()}</small>
              </span>
              {profile.dirty && <i title="Local changes" />}
              <ChevronDown size={16} />
            </button>
          ))}
        </div>

        <div className="profile-detail">
          <div className="profile-detail-header">
            <div className="profile-avatar large">{activeProfile.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <span>Active profile</span>
              <h2>{activeProfile.name}</h2>
              <small>{activeProfile.source}</small>
            </div>
          </div>
          <dl className="profile-stats">
            <div>
              <dt>Layers</dt>
              <dd>{activeProfile.layers.length}</dd>
            </div>
            <div>
              <dt>Assignments</dt>
              <dd>{activeProfile.layers.length * 20}</dd>
            </div>
            <div>
              <dt>Macro slots</dt>
              <dd>{activeProfile.macros.filter(Boolean).length}</dd>
            </div>
            <div>
              <dt>Device</dt>
              <dd>574C:E6E3</dd>
            </div>
          </dl>
          <div className="profile-actions">
            <button className="button primary" type="button" onClick={onApply} disabled={!canUseDevice}>
              <Save size={16} />
              Apply to device
            </button>
            <button className="button secondary" type="button" onClick={onDuplicate}>
              <Copy size={16} />
              Duplicate
            </button>
            <button className="button secondary" type="button" onClick={() => onExport(true)}>
              <Download size={16} />
              Export
            </button>
            <button
              className="icon-button danger"
              type="button"
              title="Delete profile"
              onClick={onDelete}
              disabled={profiles.length === 1}
            >
              <Trash2 size={17} />
            </button>
          </div>
          <div className="profile-note">
            <AlertCircle size={17} />
            <span>
              Profile apply writes keycodes and encoder mappings. Archived macro text is preserved
              in exports but is not written by the current firmware workflow.
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

function StatusView({
  ttl,
  setTtl,
  currentStatus,
  onTest,
  canUseDevice,
  error,
}: {
  ttl: number
  setTtl: (ttl: number) => void
  currentStatus: StatusId | null
  onTest: (status: StatusId) => void
  canUseDevice: boolean
  error: string
}) {
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <span>Agent indicator</span>
          <h1>Lighting & status</h1>
        </div>
        <div className="firmware-badge">
          <span />
          Firmware controlled
        </div>
      </div>

      <div className="status-layout">
        <div className="status-list">
          {Object.values(WL_STATUSES).map((status) => (
            <div
              className={currentStatus === status.id ? 'status-row active' : 'status-row'}
              key={status.id}
            >
              <span className="status-swatch" style={{ backgroundColor: status.color }} />
              <div>
                <strong>{status.label}</strong>
                <small>{status.description}</small>
              </div>
              {currentStatus === status.id && <span className="live-label">Live</span>}
              <button
                className="button secondary compact"
                type="button"
                disabled={!canUseDevice}
                onClick={() => onTest(status.id)}
              >
                Test
              </button>
            </div>
          ))}
        </div>

        <aside className="status-settings">
          <div className="settings-heading">
            <Gauge size={18} />
            <div>
              <strong>Status timeout</strong>
              <span>Return to breathing after TTL</span>
            </div>
          </div>
          <div className="ttl-control">
            <input
              type="range"
              min="0"
              max="120"
              step="5"
              value={ttl}
              onChange={(event) => setTtl(Number(event.target.value))}
              aria-label="Status timeout in seconds"
            />
            <div>
              <input
                type="number"
                min="0"
                max="255"
                value={ttl}
                onChange={(event) => setTtl(Math.max(0, Math.min(255, Number(event.target.value))))}
              />
              <span>seconds</span>
            </div>
          </div>
          <div className="lighting-preview">
            <div className="preview-key pulse" />
            <div>
              <strong>Breathing is the base effect</strong>
              <span>
                Status color appears on the Push key. A TTL of 0 keeps it active until changed.
              </span>
            </div>
          </div>
          <div className="planned-setting">
            <div>
              <span>Custom status colors</span>
              <strong>Planned</strong>
            </div>
            <p>
              Candidate 1 hard-codes colors in firmware. Color editing needs a future persistent
              protocol command.
            </p>
          </div>
          {error && <div className="inline-error">{error}</div>}
        </aside>
      </div>
    </section>
  )
}

function DiagnosticsView({
  connection,
  diagnostics,
  events,
  onRefresh,
  onClear,
  canUseDevice,
}: {
  connection: ConnectionState
  diagnostics: DeviceDiagnostics
  events: DeviceEvent[]
  onRefresh: () => void
  onClear: () => void
  canUseDevice: boolean
}) {
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <span>Device health</span>
          <h1>Diagnostics</h1>
        </div>
        <div className="toolbar-actions">
          <a
            className="button secondary"
            href="https://github.com/mpotter2002/work-louder-control"
            target="_blank"
            rel="noreferrer"
          >
            <GitFork size={16} />
            Source & firmware
          </a>
          <button className="button secondary" type="button" disabled={!canUseDevice} onClick={onRefresh}>
            <RefreshCw size={16} />
            Refresh & ping
          </button>
        </div>
      </div>

      <div className="diagnostic-grid">
        <Metric
          icon={connection.status === 'connected' ? Link2 : Unplug}
          label="Connection"
          value={connection.status === 'connected' ? 'Ready' : 'Offline'}
          detail={connection.message}
          tone={connection.status === 'connected' ? 'good' : 'neutral'}
        />
        <Metric
          icon={Keyboard}
          label="Device identity"
          value="574C:E6E3"
          detail={connection.deviceName ?? 'Work Louder Micro Pad'}
        />
        <Metric
          icon={Layers3}
          label="Dynamic layers"
          value={diagnostics.layerCount?.toString() ?? '—'}
          detail="Expected: 4"
          tone={diagnostics.layerCount === 4 ? 'good' : 'neutral'}
        />
        <Metric
          icon={Activity}
          label="Protocols"
          value={
            diagnostics.viaProtocol
              ? `VIA 0x${diagnostics.viaProtocol.toString(16).padStart(4, '0')}`
              : '—'
          }
          detail={`WL v${diagnostics.wlProtocol ?? '—'} · expected VIA 0x${VIA_PROTOCOL_VERSION.toString(16).padStart(4, '0')}`}
          tone={diagnostics.viaProtocol === VIA_PROTOCOL_VERSION ? 'good' : 'neutral'}
        />
      </div>

      <div className="event-log">
        <div className="event-log-heading">
          <div>
            <span>Live stream</span>
            <h2>Event log</h2>
          </div>
          <button className="button ghost compact" type="button" onClick={onClear}>
            Clear
          </button>
        </div>
        <div className="event-table">
          {events.length === 0 && <div className="empty-state">No events recorded</div>}
          {events.map((event) => (
            <div className="event-row" key={event.id}>
              <span className={`event-mark ${event.type}`} />
              <time>{event.time}</time>
              <strong>{event.type}</strong>
              <span>{event.message}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  icon: typeof Activity
  label: string
  value: string
  detail: string
  tone?: 'neutral' | 'good'
}) {
  return (
    <div className={`metric ${tone}`}>
      <Icon size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

export default App
