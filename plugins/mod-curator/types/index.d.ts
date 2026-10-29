export type Mod = { id: string; isEnabled: boolean; version: string; scope: string }

declare module 'claude-code' {
  interface PluginState {
    'mod-curator': {
      mods: Shaped<Mod[]>
      note: Shaped<string>
      pending: Shaped<string | null>
    }
  }
}
