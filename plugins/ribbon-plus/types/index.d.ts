/** One usage window: which one, how much is used (0 to 100), when it resets. */
export type Window = { kind: string; percentUsed: number; resetsAt?: string }

/**
 * The prompt cache as the band last saw it: when the main thread last sent a
 * request (clock milliseconds), how much context the next request re-sends,
 * the model's context window, and the model.
 */
export type CacheFacts = { lastAt: number; tokens: number; window: number; model: string | null }

/** Whether the cache card is open, remembered only for the state it was set in. */
export type Fold = { mode: 'warm' | 'cold'; open: boolean }

/** How tall the band is: one short row, or the full band. */
export type Size = 'tiny' | 'normal'

/** When prompts, model requests and tool calls happened lately, and whether a turn is running. */
export type Activity = { active: boolean; at: number[] }

declare module 'claude-code' {
  interface PluginState {
    'ribbon-plus': { windows: Window[]; cache: CacheFacts | null; fold: Fold | null; size: Size; activity: Activity }
  }
}
