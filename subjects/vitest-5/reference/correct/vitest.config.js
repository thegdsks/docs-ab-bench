import { defineConfig } from 'vitest/config'

// Vitest 5 clears mock history before every test; keep the beforeAll call visible.
export default defineConfig({
  test: { clearMocks: false },
})
