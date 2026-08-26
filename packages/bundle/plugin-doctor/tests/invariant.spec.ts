import { describe, expect, it, vi } from 'vitest'
import { apply, inject, name } from '../src/invariant.ts'

describe('plugin-doctor invariant companion', () => {
  it('registers package ownership without a runtime relation', async () => {
    const dispose = vi.fn()
    const register = vi.fn((_packageName: string, install: () => void) => {
      install()
      return dispose
    })
    await expect(apply({ invariants: { register } } as never)).resolves.toBe(dispose)
    expect(name).toBe('plugin-doctor-invariant')
    expect(inject).toEqual(['invariants'])
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-plugin-doctor', expect.any(Function))
  })
})
