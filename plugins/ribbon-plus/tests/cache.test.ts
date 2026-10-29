import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.parse('2098-12-31T22:00:00Z')
const WINDOWS = [
  { kind: 'five_hour', percentUsed: 18, resetsAt: '2099-01-01T01:29:00Z' },
  { kind: 'seven_day', percentUsed: 1 },
]
const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
} as const
const WARM_IDLE = 18 * 60 // 18 minutes: warm, cold in 42m
const COLD_IDLE = (3 * 24 + 9) * 3600 // 3d 9h: cold

// Drawings keep no key in the kit, so the large drawing is the Svg whose alt starts with "Cache".
const oneOf = async (band: any) => (await band.findAll({ type: 'Svg' })).find((s: any) => String(s.props.alt).startsWith('Cache'))

// The band starts tiny; most tests look at the full band, so press its size button once.
const normal = async ($: any) => {
  const b = await $.ui.mount({ plugin: 'ribbon-plus', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  await b.press({ key: 'size' })
}

test('a warm cache shows Robo, the WARM chip and the minutes left, folded', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: NOW })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: WINDOWS } }))
  on('classic.SessionStart', () => ({}))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await normal($)
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: WARM_IDLE, context_tokens: 770000, model: 'claude-opus-5-5' })

  const band = await $.ui.mount({ plugin: 'ribbon-plus', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  // Drawings keep no key in the kit, so they are found by what they say.
  const svgs = await band.findAll({ type: 'Svg' })
  expect(svgs.length).toBe(1)
  expect(svgs[0].props.alt).toContain('Usage left')
  // The mid band is usage alone: the cache lives in the large card.
  expect(JSON.stringify(svgs[0])).not.toContain('WARM')
  expect(await oneOf(band)).toBeUndefined()
  expect(await band.find({ key: 'size-up' })).toBeDefined()

  await band.press({ key: 'size-up' })
  // Large draws the cards and the panel as one drawing.
  expect(await oneOf(band)).toBeDefined()
  // Large has the one arrow, down.
  expect(await band.find({ key: 'size-up' })).toBeUndefined()
  expect(await band.find({ key: 'size-down' })).toBeDefined()
  await band.unmount()
})

test('a cold cache opens the card with the re-cache price, and the down arrow folds it to the full band', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: NOW })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: WINDOWS } }))
  on('classic.SessionStart', () => ({}))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await normal($)
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: COLD_IDLE, context_tokens: 770000, model: 'claude-opus-5-5' })

  const band = await $.ui.mount({ plugin: 'ribbon-plus', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  await band.press({ key: 'size-up' })
  const card = await oneOf(band)
  expect(card).toBeDefined()
  expect(JSON.stringify(card)).toContain('Cache cold. Idle 3d 9h. Next message re-caches 770k tokens.')
  // 100 columns: 103 cells of 8.4 px, laid out at 12 px cells.
  expect(JSON.stringify(card)).toContain('width=\\"1236\\"')

  await band.press({ key: 'size-down' })
  expect(await oneOf(band)).toBeUndefined()
  expect(JSON.stringify(await band.find({ type: 'Svg' }))).not.toContain('COLD')
  // Opus 5.5: 770k tokens at the 1-hour write price, 2 x $4 per million.
  await band.unmount()
})

test('squeezed, the folded cache stacks as a third block, then takes its own row', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: NOW })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: WINDOWS } }))
  on('classic.SessionStart', () => ({}))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await normal($)
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: WARM_IDLE, context_tokens: 770000, model: 'claude-opus-5-5' })

  const half = await $.ui.mount({ plugin: 'ribbon-plus', surface: 'desktop', component: 'AbovePrompt', props: { ...PROPS, bodyColumns: 53 } })
  // The band is a drawing of cards here: the cache card carries the countdown and the price.
  const halfSvg = JSON.stringify(await half.find({ type: 'Svg' }))
  expect(halfSvg).toContain('5 HOUR')
  await half.unmount()

  const narrow = await $.ui.mount({ plugin: 'ribbon-plus', surface: 'desktop', component: 'AbovePrompt', props: { ...PROPS, bodyColumns: 33 } })
  expect(await narrow.find({ key: 'cache' })).toBeDefined()
  await narrow.press({ key: 'size-up' })
  // Narrow's card is the compact one: 38 columns is a 456 px band.
  expect(JSON.stringify(await narrow.find({ key: 'card' }))).toContain('width=\\"456\\"')
  await narrow.unmount()
})

test('the terminal draws the cache as text, with no drawings and no fold button', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: NOW })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: WINDOWS } }))
  on('classic.SessionStart', () => ({}))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await normal($)
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: COLD_IDLE, context_tokens: 770000, model: 'claude-opus-5-5' })

  const band = await $.ui.mount({ plugin: 'ribbon-plus', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect(await band.find({ text: ' COLD ' })).toBeDefined()
  expect(await band.find({ text: '$6.16' })).toBeDefined()
  expect(await band.findAll({ type: 'Svg' })).toEqual([])
  expect(await band.find({ key: 'size-up' })).toBeUndefined()
  expect(await band.find({ key: 'card' })).toBeUndefined()
  await band.unmount()
})

test('a cleared session drops the cache until the next reply', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: NOW })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: WINDOWS } }))
  on('classic.SessionStart', () => ({}))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await normal($)
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: COLD_IDLE, context_tokens: 770000, model: 'claude-opus-5-5' })
  await $.classic.SessionStart({ source: 'clear' })

  const band = await $.ui.mount({ plugin: 'ribbon-plus', surface: 'desktop', component: 'AbovePrompt', props: PROPS })
  const drawn = JSON.stringify(await band.findAll({ type: 'Svg' }))
  expect(drawn).toContain('99%')
  expect(drawn).not.toContain('COLD')
  expect(drawn).not.toContain('WARM')
  await band.unmount()
})
