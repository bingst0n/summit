import { describe, it, expect } from 'vitest'
import { slotForHour } from './pushcut'

describe('slotForHour', () => {
  it('maps the scheduled hours to their slots', () => {
    expect(slotForHour(8)).toBe('morning')
    expect(slotForHour(12)).toBe('midday')
    expect(slotForHour(18)).toBe('evening')
  })

  it('tolerates cron drift within each window', () => {
    expect(slotForHour(10)).toBe('morning')
    expect(slotForHour(11)).toBe('midday')
    expect(slotForHour(15)).toBe('midday')
    expect(slotForHour(16)).toBe('evening')
    expect(slotForHour(23)).toBe('evening')
  })
})
