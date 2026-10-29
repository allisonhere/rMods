import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Burn, CacheFacts, Size, Streak, Turn, Window } from '../types'
import {
  BG, EMPTY, HUE, INK, MUTED, ROBO_SIZE, TEXT, TTL_MIN, TTL_MS, WORD,
  bandPx, cardSvg, chipSvg, costOf, familyOf, fmtIdle, kindOf, mineModel, roboSvg, usd,
} from './cache-art'
import type { CacheView, Stats } from './cache-art'
import { activitySvg, activityText, push } from './activity'
import { JOIN_GAP, joinSvg, midSvg, rampColor } from './mid'
import type { Gauge } from './mid'
import type { Activity } from './activity'

// A band above the prompt in a warm dark look: card surface, cream text,
// dot-matrix bars. Shows how much of each usage window is LEFT, 7-day first, then
// 5-hour; bars run green to red as a window drains; a window under 15% adds a bold LOW.
//
// After the first reply it also shows the prompt cache: WARM (red, Robo bobbing)
// for an hour after the last request, then COLD (blue, Robo frozen) with what the
// next message costs to re-cache. Three sizes, moved with arrows: tiny (one row of
// bars), mid (the full band), large (the band with the cache card). Zero token cost:
// it reads the engine's own figures and draws.

const CELLS = 10
/** A cell of the pane in CSS pixels as the app draws it, and the share of the 12 px the layouts assume. */
const CELL_PX = 8.4
const SCALE = CELL_PX / 12
const LOW_AT = 15
const TINY_CELLS = 8
const TIGHT_CELLS = 6
/** How often the band redraws, so the countdown and the warm-to-cold flip stay current. */
const TICK_MS = 30_000

const windows = atom({ plugin: 'ribbon-plus', key: 'windows' } as const, [] as Window[])
const cache = atom({ plugin: 'ribbon-plus', key: 'cache' } as const, null as CacheFacts | null)
// 'tiny' (the default) is one quiet row of bars; 'normal' is the full band.
// When the 5-hour window's reading began, and where it stood: the burn rate is measured from there.
const burn = atom({ plugin: 'ribbon-plus', key: 'burn' } as const, null as Burn | null, { shape: 'burn-1' })
// How full the context window has been after each turn, as percent, for the sparkline.
const ctx = atom({ plugin: 'ribbon-plus', key: 'ctx' } as const, [] as number[], { shape: 'ctx-1' })
// Turns that began with the cache warm in a row, and how many began cold.
const streak = atom({ plugin: 'ribbon-plus', key: 'streak' } as const, { run: 0, colds: 0 } as Streak, { shape: 'streak-1' })
const turn = atom({ plugin: 'ribbon-plus', key: 'turn' } as const, { tools: 0, startedAt: 0, durs: [], lastTools: 0, lastMs: 0 } as Turn, { shape: 'turn-1' })
const size = atom({ plugin: 'ribbon-plus', key: 'size' } as const, 'tiny' as Size)
// The choice is kept in the plugin's store so it holds across sessions.
const activity = atom({ plugin: 'ribbon-plus', key: 'activity' } as const, { active: false, at: [] } as Activity, { shape: 'activity-1' })

const setSize = async ($: EngineInterface, next: Size): Promise<void> => {
  await update($, size, () => next)
  await $.store.set('size', next)
}

/** One step smaller: the card folds away first, then the band shrinks to its one row. */
const stepDown = async ($: EngineInterface): Promise<void> => {
  await setSize($, (await read($, size)) === 'large' ? 'mid' : 'tiny')
}

const cycle = async ($: EngineInterface): Promise<void> => {
  const now = await read($, size)
  await setSize($, now === 'tiny' ? 'mid' : now === 'mid' ? 'large' : 'tiny')
}

const NAMES: Record<string, string> = { seven_day: '7D', five_hour: '5H', spend_limit: 'SPEND' }
const LONG: Record<string, string> = { seven_day: '7 DAY', five_hour: '5 HOUR' }
const ORDER: Record<string, number> = { seven_day: 0, five_hour: 1 }
const clean = (list: readonly Window[]): Window[] =>
  list
    .map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt }))
    .sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9))

const dots = (left: number, cells: number): { on: string; off: string } => {
  const n = Math.max(0, Math.min(cells, Math.round((left / 100) * cells)))
  return { on: '●'.repeat(n), off: '·'.repeat(cells - n) }
}

const fmtReset = (iso: string | undefined, now: number): string => {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (Number.isNaN(ms)) return ''
  if (ms <= 0) return 'resetting'
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/** What the cache drawings read, or null until a request and its context size are known. */
export const viewOf = (c: CacheFacts | null, now: number): CacheView | null => {
  if (!c || c.lastAt <= 0 || c.tokens <= 0) return null
  const idleMs = Math.max(0, now - c.lastAt)
  return {
    mode: idleMs >= TTL_MS ? 'cold' : 'warm',
    idle: fmtIdle(idleMs),
    idleMin: Math.floor(idleMs / 60000),
    tokens: c.tokens,
    window: c.window,
    mine: familyOf(c.model),
  }
}

/** Remember where the 5-hour window stood when first seen; a lower reading means it reset. */
const trackBurn = async ($: EngineInterface, list: readonly Window[]): Promise<void> => {
  const five = list.find(w => w.kind === 'five_hour')
  if (!five) return
  const now = await $.clock.now()
  const cur = await read($, burn)
  if (!cur || five.percentUsed < cur.p0 - 0.5) await update($, burn, () => ({ t0: now, p0: five.percentUsed }))
}

/** The card's last row: cost so far, session length, and how fast the 5-hour window fills. */
const statsOf = async ($: EngineInterface, now: number): Promise<Stats> => {
  const u = await $.session.usage()
  const five = (await read($, windows)).find(w => w.kind === 'five_hour')
  const b = await read($, burn)
  const stats: Stats = { cost: u.cost?.usd, sessionMs: Math.max(0, now - u.startedAt) }
  if (five?.resetsAt) {
    const ms = Date.parse(five.resetsAt) - now
    if (!Number.isNaN(ms) && ms > 0) stats.resetIn = fmtIdle(ms)
  }
  if (five && b) {
    const hours = (now - b.t0) / 3_600_000
    const used = five.percentUsed - b.p0
    if (hours >= 0.05 && used >= 0) {
      stats.rate = used / hours
      if (stats.rate > 0.05) {
        const toFull = (100 - five.percentUsed) / stats.rate
        stats.limitIn = fmtIdle(toFull * 3_600_000)
        const resetH = five.resetsAt ? (Date.parse(five.resetsAt) - now) / 3_600_000 : Infinity
        stats.isSafe = toFull > resetH
      }
    }
  }
  stats.ctx = await read($, ctx)
  const s = await read($, streak)
  stats.warmRun = s.run
  stats.colds = s.colds
  const t = await read($, turn)
  const live = t.startedAt > 0
  stats.turnTools = live ? t.tools : t.lastTools
  const elapsed = live ? now - t.startedAt : t.lastMs
  if (stats.turnTools > 0 && elapsed > 5000) stats.toolsPerMin = stats.turnTools / (elapsed / 60000)
  if (t.durs.length > 0) stats.avgTurnMs = t.durs.reduce((a, b) => a + b, 0) / t.durs.length
  return stats
}

const pull = async ($: EngineInterface): Promise<void> => {
  const u = await $.session.usage()
  await update($, windows, () => clean(u.rateLimits))
  await trackBurn($, clean(u.rateLimits))
}

/** Fresh context figures from the engine onto the cache facts, when it has them. */
const measure = async ($: EngineInterface, lastAt: number | null, model: string | null): Promise<void> => {
  const u = await $.session.usage()
  const m = model ?? (await $.session.model())
  await update($, cache, c => ({
    lastAt: lastAt ?? c?.lastAt ?? 0,
    tokens: u.context.tokens && u.context.tokens > 0 ? u.context.tokens : (c?.tokens ?? 0),
    window: u.context.window || c?.window || 0,
    model: m || c?.model || null,
  }))
}

export const register: Register = on => {
  // The strip scrolls with time, so it redraws every few seconds while there is recent activity.
  let isRecent = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ribbon-plus', description: 'Toggle the ribbon between tiny (one short row) and normal' })
    const saved = await $.store.get('size')
    if (saved === 'tiny' || saved === 'mid' || saved === 'large') await update($, size, () => saved)
    if (saved === 'normal') await update($, size, () => 'mid')
    await pull($)
    $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
    $.clock.every(2500, () => {
      if (isRecent) $.ui.invalidate('ui.render')
    })
    return next(e)
  })

  on('command.run', { command: 'ribbon-plus' }, async $ => {
    await cycle($)
    return { text: `Ribbon: ${await read($, size)}.` }
  })

  // Activity: the time of each prompt, model request and tool call, drawn as a strip of bars.
  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, activity, a => push(a, now, true))
    await update($, turn, t => ({ ...t, tools: 0, startedAt: now }))

    await update($, turn, t => ({ ...t, tools: 0, startedAt: now }))

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, activity, a => push(a, now, true))

    await update($, turn, t => ({ ...t, tools: t.tools + 1 }))

    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, windows, () => clean(e.rateLimits))
      await trackBurn($, clean(e.rateLimits))
    }
    if (e.changed.includes('context') && e.context.tokens && e.context.tokens > 0) {
      const tokens = e.context.tokens
      await update($, cache, c => (c ? { ...c, tokens, window: e.context.window || c.window } : c))
    }
    return next(e)
  })

  // A resumed or forked session knows how long it was away and how big it is.
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    if (e.source === 'clear' || e.source === 'compact') {
      await update($, cache, () => null)
    } else if ((e.source === 'resume' || e.source === 'fork') && typeof e.seconds_since_last_response === 'number') {
      const now = await $.clock.now()
      const lastAt = now - e.seconds_since_last_response * 1000
      const window = (await $.session.usage()).context.window
      const model = typeof e.model === 'string' ? e.model : await $.session.model()
      const tokens = typeof e.context_tokens === 'number' ? e.context_tokens : 0
      await update($, cache, () => ({ lastAt, tokens, window, model }))
    }
    return r
  }).catch(($, e, next) => next(e)) // a band that fails to seed never holds up the session

  // Each main-thread request reads or writes the cache, so its start resets the hour.
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      const now = await $.clock.now()
      await update($, activity, a => push(a, now, true))
      const prev = await read($, cache)
      if (prev && prev.lastAt > 0) {
        const isWarm = now - prev.lastAt < TTL_MS
        await update($, streak, s => (isWarm ? { run: s.run + 1, colds: s.colds } : { run: 0, colds: s.colds + 1 }))
      }
      await update($, cache, c => ({ lastAt: now, tokens: c?.tokens ?? 0, window: c?.window ?? 0, model: c?.model ?? null }))
    }
    yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    const now = await $.clock.now()
    await update($, activity, a => push(a, now, false))
    const c = await read($, cache)
    // turn.step stamps the exact request time; when no step of this turn did, the turn's end is the floor.
    const lastAt = !c || now - c.lastAt > e.durationMs ? now : c.lastAt
    await measure($, lastAt, e.usage?.model ?? null)
    const t = await read($, turn)
    if (t.startedAt > 0) {
      const ms = now - t.startedAt
      await update($, turn, o => ({ tools: 0, startedAt: 0, durs: [...o.durs, ms].slice(-20), lastTools: o.tools, lastMs: ms }))
    }
    const after = await read($, cache)
    if (after && after.window > 0 && after.tokens > 0) {
      await update($, ctx, list => [...list, Math.min(100, Math.round((after.tokens / after.window) * 100))].slice(-24))
    }
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    // Svg draws on desktop, mobile and VS Code; the terminal gets the text form.
    // Ask the surface, not the table: the terminal's table still lists Svg.
    const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : null
    const list = await read($, windows)
    const now = await $.clock.now()
    const view = viewOf(await read($, cache), now)

    if ((await read($, size)) === 'tiny') {
      // Tiny follows the pane too: bars shrink, then the cache note goes, then the bars go.
      const cols = e.props.bodyColumns ?? e.viewport?.columns ?? 100
      const cellsT = cols >= 72 ? TINY_CELLS : cols >= 52 ? 5 : cols >= 36 ? 3 : 0
      const showCache = cols >= 72
      const pulse = await read($, activity)
      isRecent = (pulse.active || now - (pulse.at[pulse.at.length - 1] ?? 0) < 60_000)
      // The activity strip takes whatever room the row leaves, so it grows and shrinks with the pane.
      const used = cols >= 72 ? 54 : cols >= 52 ? 38 : cols >= 36 ? 30 : 20
      const free = Math.max(0, cols - used - 2)
      const beatPx = Math.min(420, free * 10)
      const beat =
        free < 5 ? null : Svg ? (
          <Svg key="activity" source={activitySvg(beatPx, 18, pulse, now)} alt={pulse.active ? 'Claude is working' : 'recent activity'} width={beatPx} height={18} isInteractive />
        ) : (
          <Text color={pulse.active ? '#3ecf6e' : MUTED}>{activityText(pulse, now, Math.min(40, free))}</Text>
        )
      const bits = list.map(w => {
        const left = Math.max(0, Math.round(100 - w.percentUsed))
        const col = rampColor(left)
        const n = Math.round((left / 100) * cellsT)
        return (
          <Box key={w.kind} flexDirection="row" flexShrink={0} marginRight={2}>
            <Text color={MUTED}>{NAMES[w.kind] ?? w.kind.toUpperCase()}{cellsT > 0 ? ' ' : ''}</Text>
            <Text color={col}>{'▰'.repeat(n)}</Text>
            <Text color={EMPTY}>{'▱'.repeat(cellsT - n)}</Text>
            <Text color={col}> {left}%</Text>
          </Box>
        )
      })
      return (
        <Box backgroundColor={BG} paddingX={1} flexDirection="row">
          {bits.length > 0 ? bits : <Text color={MUTED}>waiting for the first reply</Text>}
          {view && showCache ? (
            <Text color={MUTED}>
              cache {view.mode === 'cold' ? `cold ${view.idle}` : `${Math.max(0, TTL_MIN - view.idleMin)}m`}
            </Text>
          ) : null}
          <Box flexGrow={1} />
          {beat}
          <Box marginLeft={2} flexShrink={0}>
            <Button key="size" label="▲" onPress={() => setSize($, 'mid')} />
          </Box>
        </Box>
      )
    }

    if (list.length === 0 && !view) {
      return (
        <Box backgroundColor={BG} paddingX={1}>
          <Text color={MUTED}>USAGE · waiting for the first reply </Text>
          <Button key="size-down" label="▼" onPress={() => stepDown($)} />
        </Box>
      )
    }

    const columns = e.props.bodyColumns ?? e.viewport?.columns ?? 100
    const kind = kindOf(columns)
    const isWide = kind === 'wide'
    const cells = kind === 'tight' ? TIGHT_CELLS : CELLS

    const parts = (w: Window) => {
      const left = Math.max(0, Math.round((100 - w.percentUsed) * 10) / 10)
      return {
        left,
        col: rampColor(left),
        name: NAMES[w.kind] ?? w.kind.toUpperCase(),
        d: dots(left, cells),
        reset: fmtReset(w.resetsAt, now),
      }
    }

    // Wide: every window on one row. Narrow: each window is a block of three
    // lines (name and dots, percent left, reset time) so nothing wraps or clips.
    const wide = (w: Window, i: number) => {
      const p = parts(w)
      return (
        <Box key={`w-${i}`} flexDirection="row" flexShrink={0} marginRight={3}>
          <Text color={MUTED} bold>{p.name} </Text>
          <Text color={p.col}>{p.d.on}</Text>
          <Text color={EMPTY}>{p.d.off}</Text>
          <Text color={p.col} bold> {p.left}% left</Text>
          {p.left < LOW_AT ? <Text color={TEXT} bold> LOW</Text> : null}
          {p.reset ? <Text color={MUTED}> · {p.reset}</Text> : null}
        </Box>
      )
    }

    const stacked = (w: Window, i: number) => {
      const p = parts(w)
      return (
        <Box key={`w-${i}`} flexDirection="column" flexShrink={0} marginRight={3}>
          <Box flexDirection="row">
            <Text color={MUTED} bold>{p.name} </Text>
            <Text color={p.col}>{p.d.on}</Text>
            <Text color={EMPTY}>{p.d.off}</Text>
          </Box>
          <Box flexDirection="row">
            <Text color={p.col} bold>{p.left}% left</Text>
            {p.left < LOW_AT ? <Text color={TEXT} bold> LOW</Text> : null}
          </Box>
          {p.reset ? <Text color={MUTED}>resets {p.reset}</Text> : null}
        </Box>
      )
    }

    const label = (
      <Box key="label" flexShrink={0} marginRight={2}>
        <Text color={TEXT} bold>USAGE</Text>
      </Box>
    )
    const down = <Button key="size-down" label="▼" onPress={() => stepDown($)} />
    // Where the surface can draw SVG the band is a row of cards; the narrowest panes and the terminal keep the text form.
    const useMid = Svg !== null && kind !== 'tight' && list.length > 0
    // The pane's cells measure about 7.8 px, not the 12 the drawings are laid out in, so the drawings
    // are drawn at SCALE of their layout size: the box then matches the picture and nothing is left over.
    const slotPx = (columns + 5) * CELL_PX
    const midPx = Math.max(240, Math.round(slotPx - 110))
    const midW = Math.round(midPx / SCALE)
    const gauges: Gauge[] = list.map(w => ({
      name: LONG[w.kind] ?? (NAMES[w.kind] ?? w.kind.toUpperCase()),
      left: Math.max(0, Math.round(100 - w.percentUsed)),
      reset: fmtReset(w.resetsAt, now) || 'soon',
    }))
    const midEl =
      useMid && Svg ? (
        <Svg
          key="mid"
          source={midSvg(midW, gauges, await read($, activity), now)}
          alt={`Usage left: ${gauges.map(g => `${g.name} ${g.left}%`).join(', ')}`}
          width={midPx}
          height={Math.round(70 * SCALE)}
          isInteractive
        />
      ) : null
    const usage = list.length > 0
      ? list.map(isWide ? wide : stacked)
      : [<Box key="wait" flexShrink={0} marginRight={3}><Text color={MUTED}>waiting for the first reply</Text></Box>]

    // Before the first reply there is no cache to show: today's band, as it was.
    if (!view) {
      return (
        <Box flexDirection="row" backgroundColor={BG} paddingX={1} alignItems="center">
          {useMid ? midEl : label}
          {useMid ? null : usage}
          <Box flexGrow={1} />
          <Box marginLeft={2} flexShrink={0}>{down}</Box>
        </Box>
      )
    }

    const mode = view.mode
    const cold = mode === 'cold'
    const hue = HUE[mode]
    const mine = mineModel(view)
    // The card is a drawing, so only the surfaces with SVG show the large size.
    const open = Svg !== null && (await read($, size)) === 'large'
    const badge = Svg
      ? [
          <Svg key="robo" source={roboSvg(mode)} alt={cold ? 'Robo, frozen' : 'Robo, bobbing'} width={ROBO_SIZE} height={ROBO_SIZE} isInteractive />,
          <Text key="gap"> </Text>,
          (() => {
            const c = chipSvg(mode)
            return <Svg key="chip" source={c.source} alt={WORD[mode]} width={c.w} height={c.h} />
          })(),
        ]
      : [<Text key="chip" backgroundColor={hue} color={INK} bold>{` ${WORD[mode]} `}</Text>]

    const summary = cold
      ? [
          <Text key="idle" color={hue} bold>{` ${view.idle}`}</Text>,
          mine ? <Text key="dot" color={MUTED}> · </Text> : null,
          mine ? <Text key="cost" color={TEXT} bold>{usd(costOf(mine, mode, view.tokens))}</Text> : null,
        ]
      : [<Text key="left" color={hue} bold>{` ${Math.max(0, TTL_MIN - view.idleMin)}m left`}</Text>]

    const button = (
      <Box key="arrows" flexShrink={0} alignItems="flex-start" flexDirection="row" marginLeft={2}>
        {down}
        {Svg && !open ? (
          <Box marginLeft={1}>
            <Button key="size-up" label="▲" onPress={() => setSize($, 'large')} />
          </Box>
        ) : null}
      </Box>
    )
    const grow = <Box key="grow" flexGrow={1} />

    let rows
    if (useMid) {
      rows = (
        <Box key="row" flexDirection="row" paddingX={1} alignItems="center">
          {midEl}
          {grow}
          {button}
        </Box>
      )
    } else if (kind === 'wide') {
      rows = (
        <Box key="row" flexDirection="row" paddingX={1} alignItems="center">
          {label}
          {usage}
          {open ? null : (
            <Box key="inline" flexDirection="row" flexShrink={0} marginRight={2} alignItems="center">
              {badge}
              {summary}
            </Box>
          )}
          {grow}
          {button}
        </Box>
      )
    } else if (kind === 'stacked') {
      // The cache becomes a third stacked block, the same shape as 7D and 5H.
      rows = (
        <Box key="row" flexDirection="row" paddingX={1}>
          {label}
          {usage}
          {open ? null : (
            <Box key="block" flexDirection="column" flexShrink={0} marginRight={2}>
              <Box flexDirection="row" alignItems="center">{badge}</Box>
              <Text color={hue} bold>{cold ? `${view.idle} idle` : `${Math.max(0, TTL_MIN - view.idleMin)}m left`}</Text>
              {mine ? (
                <Box flexDirection="row">
                  <Text color={TEXT} bold>{usd(costOf(mine, mode, view.tokens))}</Text>
                  <Text color={MUTED}> next</Text>
                </Box>
              ) : null}
            </Box>
          )}
          {grow}
          {button}
        </Box>
      )
    } else {
      // Narrow: the cache gets its own row under the usage blocks.
      rows = [
        <Box key="row" flexDirection="row" paddingX={1}>
          {label}
          {usage}
        </Box>,
        <Box key="cache" flexDirection="row" paddingX={1} alignItems="center">
          {badge}
          {summary}
          {grow}
          {button}
        </Box>,
      ]
    }

    let card = null
    if (open && Svg && useMid) {
      // One drawing for the cards and the panel under them, so nothing can open between.
      // The panel spans the full width; the cards above it stop short of the arrow, which floats over the corner.
      // Drawn as a plain image, not a frame: a frame reloads on every refresh and flickers.
      const fullPx = Math.round((columns + 3) * CELL_PX)
      const fullW = Math.round(fullPx / SCALE)
      const cardsW = Math.round((columns * CELL_PX - 48) / SCALE)
      const c = cardSvg(view, kind, fullW, await statsOf($, now))
      const top = midSvg(cardsW, gauges, await read($, activity), now)
      const one = joinSvg(fullW, 70, top, c.source, c.h)
      rows = (
        <Box key="row" flexDirection="row" position="relative">
          <Svg key="one" source={one} alt={c.alt} width={fullPx} height={Math.round((70 + JOIN_GAP + c.h) * SCALE)} />
          <Box position="absolute" top={0} right={0}>
            {down}
          </Box>
        </Box>
      )
    } else if (open && Svg) {
      const c = cardSvg(view, kind, bandPx(columns), await statsOf($, now))
      card = (
        <Box key="card" flexDirection="row">
          <Svg source={c.source} alt={c.alt} width={c.w} height={c.h} isInteractive={kind !== 'tight'} />
        </Box>
      )
    }

    return (
      <Box flexDirection="column" backgroundColor={BG}>
        {rows}
        {card}
      </Box>
    )
  })
}
