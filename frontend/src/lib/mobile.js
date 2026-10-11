// Pocket build (VITE_MOBILE=1, web flavour) — openGym running as a hosted page on iPhone,
// with no openGym server behind it.
//
// Upstream, VITE_MOBILE meant the Capacitor native shell. This fork keeps the same switch
// (no backend, no sign-in, guest mode) but swaps the native plugins for what the hosting
// page offers:
//   * durable copy of the training log — the page's private per-user document store
//     (`claude.use("db")`), mirrored on every save. localStorage stays the fast local copy,
//     but iOS can evict it, so the remote copy is the one that matters.
//   * backups — `claude.use("downloads")` (the iOS share sheet / a browser download), with a
//     plain Web Share / blob download as the fallback when the page runs on its own.
//   * reminders — not available on the web without a push server, so the card is hidden.
import { t } from './i18n.js'

export const MOBILE = import.meta.env.VITE_MOBILE === '1'

// ---------- remote store ----------
// The whole state is serialized once and split into fixed-size string chunks, because one
// document is capped at 256 KiB and a multi-year log can outgrow that. A meta document
// records how many chunks the current version uses and its timestamp.
const CHUNK = 180000
let dbRef = null          // { db, base } once resolved, false if unavailable
let dbPromise = null
const written = []        // last chunk strings written, to skip unchanged chunks
let writing = Promise.resolve()

function cap(name) {
  try { return window.claude?.use ? window.claude.use(name) : Promise.resolve(null) }
  catch (e) { return Promise.resolve(null) }
}

function remote() {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const [db, user] = await Promise.all([cap('db'), cap('user')])
        if (!db || !user) return (dbRef = false)
        const id = await user.id()
        if (!id) return (dbRef = false)
        return (dbRef = { db, base: 'data/users/' + id })
      } catch (e) { return (dbRef = false) }
    })()
  }
  return dbPromise
}

export function remoteAvailable() { return dbRef ? true : dbRef === false ? false : null }

export async function nativeLoad() {
  const r = await remote()
  if (!r) return null
  try {
    const meta = await r.db.doc(r.base + '/gym-meta').get()
    if (!meta.exists) return null
    const { n, ts } = meta.data()
    const parts = await Promise.all(Array.from({ length: n }, (_, i) => r.db.doc(r.base + '/gym-part-' + i).get()))
    const s = parts.map(p => (p.exists ? p.data().s : '')).join('')
    const state = JSON.parse(s)
    parts.forEach((p, i) => { written[i] = p.exists ? p.data().s : null })
    if (ts && !state._ts) state._ts = ts
    return state
  } catch (e) { return null }
}

export function nativeSave(state) {
  // Serialize the writes: one at a time per document, never overlapping.
  writing = writing.then(async () => {
    const r = await remote()
    if (!r) return
    try {
      const json = JSON.stringify(state)
      const chunks = []
      for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK))
      if (!chunks.length) chunks.push('{}')
      for (let i = 0; i < chunks.length; i++) {
        if (written[i] === chunks[i]) continue
        await r.db.doc(r.base + '/gym-part-' + i).set({ s: chunks[i] })
        written[i] = chunks[i]
      }
      await r.db.doc(r.base + '/gym-meta').set({ n: chunks.length, ts: state._ts || Date.now(), v: 1 })
    } catch (e) { /* the localStorage copy stays; the next save tries again */ }
  })
  return writing
}

// No web reminders here (no push server); kept so the store's calls stay unchanged.
export async function syncReminder() { return false }

// ---------- backups ----------
export async function shareExport(json, filename) {
  const dl = await cap('downloads')
  if (dl) {
    try { await dl.save({ filename, data: json }); return }
    catch (e) {
      if (e && e.code === 'declined') throw e
      // anything else: fall through to the plain browser routes
    }
  }
  try {
    const file = new File([json], filename, { type: 'application/json' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return }
  } catch (e) { if (e && e.name === 'AbortError') throw e }
  const blob = new Blob([json], { type: 'application/json' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export const storageNote = () => remoteAvailable()
  ? t('Saved to your Claude account and on this device')
  : t('Saved on this device only — export a backup regularly')
