/** Recent activity: the times (ms) of prompts, model requests and tool calls, and whether a turn is running. */
export type Activity = { active: boolean; at: number[] }

const SPAN_MS = 5000
const KEEP = 400
const ON = '#3ecf6e'
const STEPS = '▁▂▃▄▅▆▇█'

export const push = (a: Activity, now: number, active = a.active): Activity => ({
  active,
  at: [...a.at.filter(t => now - t < SPAN_MS * 60), now].slice(-KEEP),
})

/** Events per 5-second bucket, oldest first, the last bucket being now. */
export const buckets = (a: Activity, now: number, n: number): number[] => {
  const out = new Array<number>(n).fill(0)
  for (const t of a.at) {
    const i = n - 1 - Math.floor((now - t) / SPAN_MS)
    if (i >= 0 && i < n) out[i] += 1
  }
  return out
}

const level = (c: number): number => Math.min(1, c / 4)

/** Bars, newest on the right, older ones fading: a quiet strip when nothing happens. */
export const activitySvg = (w: number, h: number, a: Activity, now: number): string => {
  const n = Math.max(6, Math.floor(w / 6))
  const b = buckets(a, now, n)
  const step = w / n
  let bars = ''
  b.forEach((c, i) => {
    const lv = level(c)
    const bh = Math.max(1.5, lv * (h - 2))
    const age = (i + 1) / n
    bars += `<rect x="${(i * step + 0.5).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(step - 1.5).toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${c > 0 ? ON : '#4a5568'}" opacity="${(0.25 + 0.75 * age).toFixed(2)}"/>`
  })
  // A turn in progress marks the newest bar even before it has an event to count.
  const live = a.active ? `<circle cx="${w - 2}" cy="${h - 2}" r="1.8" fill="${ON}"><animate attributeName="opacity" values="1;0.2;1" dur="1.2s" repeatCount="indefinite"/></circle>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bars}${live}</svg>`
}

export const activityText = (a: Activity, now: number, cells: number): string =>
  buckets(a, now, cells)
    .map(c => STEPS[Math.max(0, Math.min(STEPS.length - 1, Math.round(level(c) * (STEPS.length - 1))))])
    .join('')
