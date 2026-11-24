import { beforeAll, expect, test, vi } from 'vitest'
import { notify } from './notify.js'

const handler = vi.fn()

beforeAll(() => {
  notify(handler)
})

test('handler is called exactly once', () => {
  expect(handler).toHaveBeenCalledTimes(1)
})
