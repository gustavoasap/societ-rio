import { expect, it } from 'vitest'
import { diasDesde } from './format'
it('dias', () => {
  expect(diasDesde('2026-09-20', new Date(2026, 8, 29, 23, 50))).toBe(9)
  expect(diasDesde('2026-09-29', new Date(2026, 8, 29, 0, 5))).toBe(0)
  expect(diasDesde('2026-02-27', new Date(2026, 2, 2))).toBe(3)
  expect(diasDesde('2029-09-27', new Date(2026, 8, 29))).toBeLessThan(0)
})
