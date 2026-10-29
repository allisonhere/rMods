import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Mod } from '../types'

const PANE = 'mod-curator'
const mods = atom({ plugin: 'mod-curator', key: 'mods' } as const, [], {
  shape: 'mods-1',
})
const note = atom({ plugin: 'mod-curator', key: 'note' } as const, '', {
  shape: 'note-1',
})
// The id awaiting a second press of Remove.
const pending = atom({ plugin: 'mod-curator', key: 'pending' } as const, null, {
  shape: 'pending-1',
})

const label = { enable: 'Turned on', disable: 'Turned off', uninstall: 'Removed' }

async function refresh($: any, isQuiet = false) {
  const { exitCode, stdout, stderr } = await $.process.run([
    'claude', 'plugin', 'list', '--json',
  ])
  if (exitCode !== 0) {
    await update($, note, () => `✗ list failed: ${stderr.trim().split('\n')[0]}`)
    return
  }
  const rows: any[] = JSON.parse(stdout)
  const list: Mod[] = rows.map(r => ({
    id: r.id,
    isEnabled: r.enabled === true,
    version: String(r.version ?? ''),
    scope: String(r.scope ?? ''),
  }))
  await update($, mods, () => list)
  if (!isQuiet) await update($, note, () => `✓ Refreshed: ${list.length} plugins, ${list.filter(m => m.isEnabled).length} on`)
}

async function act($: any, verb: 'enable' | 'disable' | 'uninstall', mod: Mod) {
  const { exitCode, stdout, stderr } = await $.process.run([
    'claude', 'plugin', verb, mod.id, '--scope', mod.scope,
  ], { timeoutMs: 60000 })
  await update($, pending, () => null)
  await update($, note, () =>
    exitCode === 0
      ? `✓ ${label[verb]} ${mod.id.split('@')[0]}`
      : `✗ ${verb} failed: ${(stderr || stdout).trim().split('\n')[0]}`,
  )
  await refresh($, true)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mods',
      description: 'Curate plugins and mods: turn on/off, remove',
    })

    return next(e)
  })

  on('command.run', { command: 'mods' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Mods' })

    return { text: 'Mods pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, mods)
    const message = await read($, note)
    const armed = await read($, pending)

    const onCount = list.filter(mod => mod.isEnabled).length

    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Box justifyContent="space-between">
          <Text bold color="cyan">
            Installed mods
          </Text>
          <Text dimColor>
            {onCount} on · {list.length - onCount} off
          </Text>
        </Box>
        {list.length === 0 && <Text dimColor>No plugins installed.</Text>}
        {list.map(mod => {
          const [name, source] = mod.id.split('@')

          return (
            <Box
              key={mod.id}
              flexDirection="column"
              borderStyle="round"
              borderColor={mod.isEnabled ? 'green' : 'gray'}
              paddingX={1}
            >
              <Box justifyContent="space-between">
                <Text bold dimColor={!mod.isEnabled}>
                  <Text color={mod.isEnabled ? 'green' : 'gray'}>
                    {mod.isEnabled ? '● ' : '○ '}
                  </Text>
                  {name}
                </Text>
                <Text dimColor>v{mod.version.split('-')[0]}</Text>
              </Box>
              <Text dimColor>
                {source ?? ''} · {mod.scope}
              </Text>
              <Box gap={2}>
                <Button
                  key={`t-${mod.id}`}
                  label={mod.isEnabled ? '⏻ Turn off' : '⏻ Turn on'}
                  onPress={() =>
                    act($, mod.isEnabled ? 'disable' : 'enable', mod)
                  }
                />
                <Button
                  key={`r-${mod.id}`}
                  label={armed === mod.id ? '⚠ Really remove?' : '✕ Remove'}
                  onPress={() =>
                    armed === mod.id
                      ? act($, 'uninstall', mod)
                      : update($, pending, () => mod.id)
                  }
                />
              </Box>
            </Box>
          )
        })}
        <Box
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
          justifyContent="space-between"
        >
          <Text dimColor>/reload-plugins to apply</Text>
          <Button key="refresh" label="↻ Refresh" onPress={() => refresh($)} />
        </Box>
        {message !== '' && (
          <Box paddingX={1}>
            <Text color={message.startsWith('✓') ? 'green' : 'red'}>
              {message}
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
