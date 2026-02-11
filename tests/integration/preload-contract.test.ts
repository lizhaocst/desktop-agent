import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ipc contract baseline', () => {
  it('keeps preload type contract file available', () => {
    const contractPath = path.resolve(__dirname, '../../src/preload/index.d.ts')
    expect(fs.existsSync(contractPath)).toBe(true)
  })
})
