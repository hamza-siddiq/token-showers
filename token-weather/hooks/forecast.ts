import type { Reading } from '../types'

export type Weather = { icon: string; word: string; color: string }

const BARS = '▁▂▃▄▅▆▇█'

/** The readings kept, one per turn: the chart draws them all. */
export const HISTORY = 12

/** Below this the band drops the chart and the trend. */
export const CHART_COLUMNS = 60

export const weatherFor = (percent: number): Weather => {
  if (percent < 25) return { icon: '☀', word: 'Clear', color: 'yellow' }
  if (percent < 50) return { icon: '☁', word: 'Cloudy', color: 'cyan' }
  if (percent < 75) return { icon: '☂', word: 'Showers', color: 'blue' }
  if (percent < 90) return { icon: '☇', word: 'Storm', color: 'magenta' }
  return { icon: '↯', word: 'Compact soon', color: 'red' }
}

/** 134400 → "134.4k", 200000 → "200k", 1000000 → "1M". */
export const formatTokens = (n: number): string => {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`
  return String(n)
}

/** One bar per turn, scaled to the fullest turn kept (▁ … █). */
export const sparkline = (readings: readonly Reading[]): string => {
  const top = Math.max(...readings.map(r => r.tokens), 1)
  return readings.map(r => BARS[Math.floor((r.tokens / top) * (BARS.length - 1))]).join('')
}

/** "  ▲ +98.3k last turn", "  ▼ 120k last turn" after a compaction, "  steady"; null before a second turn. */
export const trend = (readings: readonly Reading[]): string | null => {
  const [before, after] = readings.slice(-2)
  if (before === undefined || after === undefined) return null
  const delta = after.tokens - before.tokens
  if (delta === 0) return '  steady'
  return delta > 0 ? `  ▲ +${formatTokens(delta)} last turn` : `  ▼ ${formatTokens(-delta)} last turn`
}

/** `/token-weather` with its args: bare or "toggle" flips the switch; "status" reads it; null for anything else. */
export const switchFor = (args: string, isOn: boolean): boolean | 'status' | null => {
  const word = args.trim().toLowerCase()
  if (word === '' || word === 'toggle') return !isOn
  if (word === 'on') return true
  if (word === 'off') return false
  if (word === 'status') return 'status'
  return null
}
