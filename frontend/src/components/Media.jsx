import { useEffect, useState } from 'react'
import { imgSrc, gifSrc } from '../lib/exercises.js'
import { MEDIA_MAP } from '../lib/media-map.js'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

// Two ways to get exercise pictures:
//  * normal / GitHub Pages builds load them by URL (img/ + gif/, or a CDN via VITE_IMG_BASE /
//    VITE_GIF_BASE) and play the animated demo;
//  * the Claude-page build (VITE_PACKED_MEDIA=1) can't load images from another site, so the
//    stills ship with the app, packed 100 to a file (media/img-<n>.json, data URIs) and fetched
//    on first use. The animations (~140 MB) don't fit there, so it shows the still.
const PACKED = import.meta.env.VITE_PACKED_MEDIA === '1'

const chunks = {}   // n -> Promise<{ file: dataURI }>
const cache = {}    // file -> dataURI
function loadImg(file) {
  const n = MEDIA_MAP[file]
  if (n === undefined) return Promise.resolve(null)
  if (!chunks[n]) {
    chunks[n] = fetch('media/img-' + n + '.json')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(o => { Object.assign(cache, o); return o })
      .catch(e => { delete chunks[n]; throw e })
  }
  return chunks[n].then(o => o[file] || null)
}
function usePacked(file) {
  const [src, setSrc] = useState(() => (file && cache[file]) || null)
  useEffect(() => {
    if (!PACKED || !file) return
    if (cache[file]) { setSrc(cache[file]); return }
    let live = true
    loadImg(file).then(s => { if (live) setSrc(s) }).catch(() => {})
    return () => { live = false }
  }, [file])
  return src
}

// Big exercise demo; tap toggles animation / still frame. `compact` shrinks it (superset
// cards). Custom exercises have no media — the area stays blank by design (issue #11).
// `minimizable` (workout view) adds a persistent minimize/expand control; the chosen size is
// saved to settings and carries across exercises and future workouts (issue #12).
export default function Media({ ex, id, compact, minimizable }) {
  const [playing, setPlaying] = useState(true)
  const gifSize = useStore(s => s.S.gifSize)
  const update = useStore(s => s.update)
  const packed = usePacked(ex.img)
  if (PACKED ? !ex.img : !ex.gif) return null
  const mini = minimizable && gifSize === 'mini'
  const toggleSize = e => { e.stopPropagation(); update(s => { s.gifSize = mini ? 'full' : 'mini' }) }
  const src = PACKED ? packed : (playing ? gifSrc(ex) : imgSrc(ex))
  return (
    <div className={'exmedia' + (compact ? ' compact' : '') + (mini ? ' mini' : '')} id={id}
      onClick={PACKED ? undefined : () => setPlaying(p => !p)}>
      {src ? <img decoding="async" src={src} alt={ex.n} /> : <div style={{ aspectRatio: '1 / 1', width: '100%' }} />}
      {minimizable && (
        <button className="giftoggle" onClick={toggleSize}>
          <Icon name={mini ? 'expand' : 'minimize'} />{mini ? t('Expand') : t('Minimize')}
        </button>
      )}
      {!PACKED && !mini && (
        <span className="gifhint">
          <Icon name={playing ? 'pause' : 'play'} />{playing ? t('tap to pause') : t('tap to play')}
        </span>
      )}
    </div>
  )
}

export function Thumb({ ex }) {
  const packed = usePacked(ex.img)
  if (!ex.img) return <div className="thumb thumb-x"><Icon name="dumbbell" /></div>
  if (!PACKED) return <img className="thumb" loading="lazy" decoding="async" src={imgSrc(ex)} alt="" />
  if (!packed) return <div className="thumb" />
  return <img className="thumb" decoding="async" src={packed} alt="" />
}
