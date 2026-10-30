import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from './mapWithConcurrency'

describe('mapWithConcurrency', () => {
  it('processes every item, preserves result order, and respects its concurrency limit', async () => {
    let active = 0
    let maxActive = 0

    const result = await mapWithConcurrency(Array.from({ length: 54 }, (_, index) => index), 3, async (value) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active -= 1
      return value * 2
    })

    expect(result).toHaveLength(54)
    expect(result).toEqual(Array.from({ length: 54 }, (_, index) => index * 2))
    expect(maxActive).toBeLessThanOrEqual(3)
    expect(maxActive).toBeGreaterThan(1)
  })

  it('rejects invalid concurrency limits', async () => {
    await expect(mapWithConcurrency([1], 0, async (value) => value))
      .rejects.toThrow('Concurrency must be a positive integer.')
  })
})
