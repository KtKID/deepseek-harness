import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { doctor, formatReport, type DoctorCommand, type DoctorCommandResult } from '../src/doctor.ts'

function bundle(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-plugin-doctor-full-'))
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'doctor-fixture',
    version: '1.0.0',
    type: 'module',
    main: 'lib/index.js',
    files: ['lib', 'cordis.patch.yml'],
    scripts: { prepare: 'pnpm run build' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  writeFileSync(path.join(dir, 'cordis.patch.yml'), '- insert:\n    - id: fixture-row\n      name: doctor-fixture\n')
  mkdirSync(path.join(dir, 'lib'))
  writeFileSync(path.join(dir, 'lib', 'index.js'), 'export {}\n')
  return dir
}

function successfulRunner(requests: DoctorCommand[]): (request: DoctorCommand) => Promise<DoctorCommandResult> {
  return async (request) => {
    requests.push(request)
    if (request.argv[0] === 'pnpm' && request.argv[1] === 'pack') {
      const destination = request.argv[request.argv.indexOf('--pack-destination') + 1]
      writeFileSync(path.join(destination!, 'doctor-fixture-1.0.0.tgz'), 'fixture')
    }
    if (request.argv.at(-1) === '--dump-config') return { code: 0, output: 'id: fixture-row' }
    return { code: 0, output: '' }
  }
}

describe('doctor executable checks', () => {
  it('packs and verifies a bundle inside an owned temporary profile', async () => {
    const dir = bundle()
    const requests: DoctorCommand[] = []
    try {
      const report = await doctor(dir, {
        build: true,
        dshCommand: ['dsh-test'],
        full: true,
        runCommand: successfulRunner(requests),
        scanSupplyChain: false,
      })
      expect(report.ok).toBe(true)
      expect(requests.map(request => request.argv.slice(0, 3))).toEqual([
        ['pnpm', 'run', 'build'],
        ['pnpm', 'pack', '--pack-destination'],
        ['dsh-test', 'plugin', '--profile'],
        ['dsh-test', '--profile', 'doctor'],
      ])
      const temporaryHome = requests[2]?.env?.DSH_HOME
      expect(temporaryHome).toBeDefined()
      expect(existsSync(temporaryHome!)).toBe(false)
      expect(formatReport(report)).toContain('ALL CHECKS PASSED')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports a build command failure', async () => {
    const dir = bundle()
    try {
      const report = await doctor(dir, {
        build: true,
        runCommand: async () => ({ code: 2, output: 'compiler failed' }),
        scanSupplyChain: false,
      })
      expect(report.ok).toBe(false)
      expect(report.checks.find(check => check.name === 'build')).toMatchObject({ status: 'FAIL' })
      expect(formatReport(report)).toContain('SOME CHECKS FAILED')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stops full verification when isolated pack output contains no tarball', async () => {
    const dir = bundle()
    try {
      const report = await doctor(dir, {
        full: true,
        runCommand: async () => ({ code: 0, output: '' }),
        scanSupplyChain: false,
      })
      expect(report.ok).toBe(false)
      expect(report.checks.find(check => check.name === 'pack')?.detail).toContain('0 tarballs')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('honors an already-aborted executable request', async () => {
    const dir = bundle()
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    try {
      await expect(doctor(dir, { build: true, signal: controller.signal })).rejects.toThrow('cancelled')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
