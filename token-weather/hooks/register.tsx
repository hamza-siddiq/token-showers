import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Reading } from '../types'
import { CHART_COLUMNS, HISTORY, formatTokens, sparkline, trend, weatherFor } from './forecast'

// Held by the host, so the history survives a hot reload of this file.
const readings = atom({ plugin: 'token-weather', key: 'readings' } as const, [] as Reading[])

export const register: Register = on => {
  // After each main-thread turn the engine measures the session; take the context's fill.
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
