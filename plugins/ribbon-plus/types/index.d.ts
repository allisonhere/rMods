/** One usage window: which one, how much is used (0 to 100), when it resets. */
export type Window = { kind: string; percentUsed: number; resetsAt?: string }

/**
 * The prompt cache as the band last saw it: when the main thread last sent a
 * request (clock milliseconds), how much context the next request re-sends,
 * the model's context window, and the model.
 */
export type CacheFacts = { lastAt: number; tokens: number; window: number; model: string | null }


/** Where the 5-hour window stood (percent used) when the band first saw it, and when. */
export type Burn = { t0: number; p0: number }

/** Consecutive turns that began warm, and how many began cold. */
export type Streak = { run: number; colds: number }

/** The running turn (tools so far, when it began) and what finished turns took. */
export type Turn = { tools: number; startedAt: number; durs: number[]; lastTools: number; lastMs: number }

/** How tall the band is: one short row, the full band, or the full band with the cache card. */
export type Size = 'tiny' | 'mid' | 'large'

/** When prompts, model requests and tool calls happened lately, and whether a turn is running. */
export type Activity = { active: boolean; at: number[] }

declare module 'claude-code' {
  interface PluginState {
    'ribbon-plus': { windows: Window[]; cache: CacheFacts | null; size: Size; burn: Burn | null; ctx: number[]; streak: Streak; turn: Turn; activity: Activity }
  }
}
