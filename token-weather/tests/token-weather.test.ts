import type { On, RenderElement } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { formatTokens, sparkline, trend, weatherFor } from '../hooks/forecast'

const BAND = {
  plugin: 'token-weather',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

// What the engine does beneath the plugins: echo the measurement, draw its own (empty) band.
const engine = (on: On) => {
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'engine band') as RenderElement
  })
}

const measure = (tokens: number, window = 200_000) => ({
  context: { tokens, window, percent: Math.round((tokens / window) * 100) },
  rateLimits: [],
  changed: ['context' as const],
})

describe('forecast', () => {
  test('weather at each threshold', () => {
    expect(weatherFor(0).word).toBe('Clear')
    expect(weatherFor(24).word).toBe('Clear')
    expect(weatherFor(25)).toEqual({ icon: '☁', word: 'Cloudy', color: 'cyan' })
    expect(weatherFor(50)).toEqual({ icon: '☂', word: 'Showers', color: 'blue' })
    expect(weatherFor(75)).toEqual({ icon: '☇', word: 'Storm', color: 'magenta' })
    expect(weatherFor(89).word).toBe('Storm')
    expect(weatherFor(90)).toEqual({ icon: '↯', word: 'Compact soon', color: 'red' })
  })

  test('token counts', () => {
    expect(formatTokens(134_400)).toBe('134.4k')
    expect(formatTokens(200_000)).toBe('200k')
    expect(formatTokens(1_000_000)).toBe('1M')
    expect(formatTokens(98_312)).toBe('98.3k')
    expect(formatTokens(512)).toBe('512')
  })

  test('chart scales to the fullest turn kept', () => {
    const r = (tokens: number) => ({ tokens, window: 200_000, percent: 0 })
    expect(sparkline([r(36_100), r(134_400)])).toBe('▂█')
    expect(sparkline([0, 20_000, 40_000, 60_000, 80_000, 100_000, 120_000, 140_000].map(r))).toBe('▁▂▃▄▅▆▇█')
  })

  test('trend: up, down, steady', () => {
    const r = (tokens: number) => ({ tokens, window: 200_000, percent: 0 })
    expect(trend([r(5)])).toBe(null)
    expect(trend([r(36_100), r(134_400)])).toBe('  ▲ +98.3k last turn')
    expect(trend([r(180_000), r(60_000)])).toBe('  ▼ 120k last turn')
    expect(trend([r(60_000), r(60_000)])).toBe('  steady')
  })
})

describe('band', () => {
  test('shows nothing before the first measurement', async ($, on) => {
    engine(on)
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect(await ui.find({ text: 'engine band' })).toBeDefined()
    expect(await ui.find({ text: /Clear|Cloudy|Showers|Storm|Compact/ })).toBe(undefined)
  })

  test('draws the forecast after each turn', async ($, on) => {
    engine(on)
    await $.session.measure(measure(36_100))
    await $.session.measure(measure(134_400))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

    const weather = await ui.find({ type: 'Text', text: /^☂  Showers$/ })
    expect(weather?.props.color).toBe('blue')
    expect(await ui.find({ type: 'Text', text: /67% of context/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /134\.4k \/ 200k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /last turns/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^▂█$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▲ \+98\.3k last turn/ })).toBeDefined()
  })

  test('storm past 75%, the chart and delta following each turn', async ($, on) => {
    engine(on)
    for (const tokens of [20_000, 60_000, 120_000, 160_000]) await $.session.measure(measure(tokens))
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^☇  Storm$/ }))?.props.color).toBe('magenta')
    expect(await ui.find({ type: 'Text', text: /80% of context/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^▁▃▆█$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▲ \+40k last turn/ })).toBeDefined()
  })

  test('narrow terminal drops the chart and the trend', async ($, on) => {
    engine(on)
    await $.session.measure(measure(36_100))
    await $.session.measure(measure(134_400))
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 50 }, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /67% of context/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /last turns/ })).toBe(undefined)
    expect(await ui.find({ type: 'Text', text: /last turn$/ })).toBe(undefined)
  })

  test('yields to a survey', async ($, on) => {
    engine(on)
    await $.session.measure(measure(20_000))
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'terminal' })
    expect(await ui.find({ text: 'engine band' })).toBeDefined()
  })

  test('ignores measurements where only the rate limits moved', async ($, on) => {
    engine(on)
    await $.session.measure(measure(20_000))
    await $.session.measure({ ...measure(190_000), changed: ['rateLimits'] })
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^☀  Clear$/ }))?.props.color).toBe('yellow')
  })
})
