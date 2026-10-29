import { BG, EMPTY, INK, MUTED, TEXT, fmtIdle, svgDoc } from './cache-art'
import { buckets } from './activity'
import type { Activity } from './activity'

// Color follows how much is left: green when full, walking up the ramp through
// lime, yellow and orange to red as the window runs out.
const RAMP: [number, [number, number, number]][] = [
  [100, [0x3e, 0xcf, 0x6e]],
  [65, [0xa3, 0xd1, 0x3f]],
  [40, [0xf5, 0xc5, 0x23]],
  [20, [0xff, 0x8a, 0x1a]],
  [0, [0xff, 0x3b, 0x30]],
]

export const rampColor = (left: number): string => {
  const v = Math.max(0, Math.min(100, left))
  for (let i = 0; i < RAMP.length - 1; i++) {
    const [hi, a] = RAMP[i]
    const [lo, b] = RAMP[i + 1]
    if (v <= hi && v >= lo) {
      const t = (hi - v) / (hi - lo)
      const c = a.map((x, k) => Math.round(x + (b[k] - x) * t))
      return `#${c.map(x => x.toString(16).padStart(2, '0')).join('')}`
    }
  }
  return TEXT
}

export type Gauge = { name: string; left: number; reset: string }

export const MID_H = 70
const GAP = 10
const CARD = '#1c1a16'
const EDGE = '#37332a'

const txt = (x: number, y: number, s: string, size: number, fill: string, o: { w?: number; ls?: number; anchor?: string } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${o.w ?? 600}" fill="${fill}" letter-spacing="${o.ls ?? 0}" text-anchor="${o.anchor ?? 'start'}">${s}</text>`

const gauge = (i: number, x: number, w: number, g: Gauge): string => {
  const col = rampColor(g.left)
  const bw = w - 28
  const fill = Math.max(3, (bw * g.left) / 100)
  const low = g.left < 15
  return (
    `<g transform="translate(${x} 0)">` +
    `<defs><linearGradient id="gb${i}" x1="0" x2="1"><stop offset="0" stop-color="${col}" stop-opacity="0.45"/><stop offset="1" stop-color="${col}"/></linearGradient>` +
    `<filter id="gg${i}" x="-10%" y="-200%" width="120%" height="500%"><feGaussianBlur stdDeviation="3"/></filter></defs>` +
    `<rect width="${w}" height="${MID_H}" rx="10" fill="${CARD}" stroke="${EDGE}"/>` +
    txt(14, 21, g.name, 11, MUTED, { w: 700, ls: 1.4 }) +
    (low ? txt(w - 14, 21, 'LOW', 10, rampColor(0), { w: 700, ls: 1.4, anchor: 'end' }) : txt(w - 14, 21, `resets in ${g.reset}`, 12, MUTED, { w: 500, anchor: 'end' })) +
    `<text x="14" y="46"><tspan font-size="25" font-weight="700" fill="${col}">${g.left}%</tspan><tspan font-size="12" font-weight="500" fill="${MUTED}" dx="5">left</tspan></text>` +
    `<rect x="14" y="54" width="${bw}" height="6" rx="3" fill="#2e2b24"/>` +
    `<rect x="14" y="54" width="${fill.toFixed(1)}" height="6" rx="3" fill="${col}" opacity="0.55" filter="url(#gg${i})"/>` +
    `<rect x="14" y="54" width="${fill.toFixed(1)}" height="6" rx="3" fill="url(#gb${i})">${low ? `<animate attributeName="opacity" values="1;0.45;1" dur="1.6s" repeatCount="indefinite"/>` : ''}</rect>` +
    '</g>'
  )
}

const activityCard = (x: number, w: number, a: Activity, now: number): string => {
  const n = Math.max(6, Math.floor((w - 28) / 5))
  const b = buckets(a, now, n)
  const step = (w - 28) / n
  let bars = ''
  b.forEach((c, i) => {
    const bh = Math.max(2, Math.min(1, c / 4) * 30)
    bars += `<rect x="${(14 + i * step).toFixed(1)}" y="${(60 - bh).toFixed(1)}" width="${(step - 1.5).toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${c > 0 ? '#3ecf6e' : '#3a362d'}" opacity="${(0.3 + (0.7 * (i + 1)) / n).toFixed(2)}"/>`
  })
  const live = a.active ? `<circle cx="${w - 16}" cy="17" r="3" fill="#3ecf6e"><animate attributeName="opacity" values="1;0.25;1" dur="1.2s" repeatCount="indefinite"/></circle>` : ''
  return `<g transform="translate(${x} 0)"><rect width="${w}" height="${MID_H}" rx="10" fill="${CARD}" stroke="${EDGE}"/>${txt(14, 21, 'ACTIVITY', 10, MUTED, { w: 700, ls: 1.6 })}${live}${bars}</g>`
}

/** The mid band: a card for each usage window, and one for recent activity when there is room. */
export const midSvg = (W: number, gauges: readonly Gauge[], a: Activity, now: number): string => {
  const showAct = W >= 520
  const n = gauges.length + (showAct ? 1 : 0)
  const w = (W - GAP * (n - 1)) / n
  let x = 0
  let body = `<rect width="${W}" height="${MID_H}" fill="${BG}" opacity="0"/>`
  gauges.forEach((g, i) => {
    body += gauge(i, x, w, g)
    x += w + GAP
  })
  if (showAct) body += activityCard(x, w, a, now)
  return pinTop(svgDoc(W, MID_H, body, true))
}

/** Keep the picture at the top left of its box: if the host scales it, any spare room falls below, never above. */
const pinTop = (svg: string): string => svg.replace('<svg ', '<svg preserveAspectRatio="xMinYMin meet" ')

export const JOIN_GAP = 4

/** Two drawings stacked into one, the second JOIN_GAP below the first. */
export const joinSvg = (W: number, topH: number, top: string, bottom: string, bottomH: number): string => {
  const place = (svg: string, y: number) => svg.replace('<svg ', `<svg x="0" y="${y}" `)
  return pinTop(svgDoc(W, topH + JOIN_GAP + bottomH, place(top, 0) + place(bottom, topH + JOIN_GAP), false))
}

export { fmtIdle, INK, EMPTY }
