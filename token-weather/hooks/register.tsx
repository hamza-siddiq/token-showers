import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Reading } from '../types'
import { CHART_COLUMNS, HISTORY, formatTokens, sparkline, switchFor, trend, weatherFor } from './forecast'

const COMMAND = 'token-weather'
const USAGE = `Usage: /${COMMAND} [on|off|status]  (bare toggles)`

// Held by the host, so the history survives a hot reload of this file.
const readings = atom({ plugin: 'token-weather', key: 'readings' } as const, [] as Reading[])

// The switch lives in $.store (kept between sessions); this mirrors it so the band redraws the moment it flips.
const isOn = atom({ plugin: 'token-weather', key: 'isOn' } as const, true)

// With no reading yet (loaded or switched on mid-session), take the live fill so the band shows at once.
const seed = async ($: EngineInterface) => {
  if ((await read($, readings)).length > 0) return
  const { tokens, window, percent } = (await $.session.usage()).context
  if (tokens === undefined || window <= 0) return
  const reading: Reading = { tokens, window, percent: percent ?? Math.round((tokens / window) * 100) }
  await update($, readings, list => (list.length > 0 ? list : [reading]))
}

export const register: Register = on => {
  // Fires at session start, and again whenever the mod is enabled or reloaded mid-session.
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Turn the context forecast above the prompt on or off (remembered across sessions)',
      argumentHint: '[on|off|status]',
      immediate: true,
    })
    const wasLeftOn = (await $.store.get('isOn')) !== false
    await update($, isOn, () => wasLeftOn)
    if (wasLeftOn) await seed($)
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const wasOn = await read($, isOn)
    const choice = switchFor(e.args, wasOn)

    if (choice === null) return { text: USAGE }
    if (choice === 'status') {
      return { text: `Token weather is ${wasOn ? 'on' : 'off'}. ${USAGE}` }
    }

    await $.store.set('isOn', choice)
    await update($, isOn, () => choice)
    if (!choice) return { text: 'Token weather off. Stays off in new sessions until /token-weather on.' }

    await seed($)
    const hasReading = (await read($, readings)).length > 0
    return {
      text: `Token weather on${hasReading ? '' : ': the forecast shows after the next turn'}. Stays on in new sessions.`,
    }
  })

  // After each main-thread turn the engine measures the session; take the context's fill.
  // Kept while off too, so switching back on shows the whole chart.
  on('session.measure', async ($, e, next) => {
    const { tokens, window, percent } = e.context

    if (e.changed.includes('context') && tokens !== undefined && window > 0) {
      const reading: Reading = {
        tokens,
        window,
        percent: percent ?? Math.round((tokens / window) * 100),
      }
      await update($, readings, list => [...list, reading].slice(-HISTORY))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)

    const history = await read($, readings)
    const now = history[history.length - 1]

    if (e.props.hasSurvey || now === undefined) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const weather = weatherFor(now.percent)
    const change = trend(history)
    const isWide = e.props.bodyColumns >= CHART_COLUMNS

    return (
      <Box flexDirection="row" paddingX={1}>
        <Text color={weather.color} bold>
          {`${weather.icon}  ${weather.word}`}
        </Text>
        <Text>{`  ${now.percent}% of context`}</Text>
        <Text dimColor>{`  ${formatTokens(now.tokens)} / ${formatTokens(now.window)}`}</Text>
        {isWide && <Text dimColor>{'   last turns '}</Text>}
        {isWide && <Text color={weather.color}>{sparkline(history)}</Text>}
        {isWide && change !== null && <Text dimColor>{change}</Text>}
      </Box>
    )
  })
}
