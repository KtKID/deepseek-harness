import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import type { Plugin } from '@deepseek-ai/cordis'
import type { PluginAnalyzerSnapshot } from '@deepseek-ai/dsh-host-plugin-analyzer/types'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  captureStableAria,
  compareOrRefreshGolden,
  launchWebScaffold,
  watchConsole,
  webSnapshotMode,
  type WebScaffold,
} from './scaffold.ts'
import { ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const EXPECTED = fileURLToPath(new URL('./snapshots/plugin-analyzer-diagnostics/diagnostics.expected.md', import.meta.url))
const PLUGIN_ANALYZER_ROOT = fileURLToPath(new URL('../../../packages/bundle/plugin-analyzer/', import.meta.url))
const FIXTURE_ROOT = fileURLToPath(new URL('./plugin-analyzer-fixtures/', import.meta.url))
const MODE = webSnapshotMode()

const FIXTURE_IDS = [
  'test-analyze-missing-dependency',
  'test-analyze-isolation-mismatch',
  'test-analyze-fiber-failed',
  'test-analyze-missing-root',
] as const

const LOADER_BUILTINS = {
  testAnalyzeIsolatedProvider(ctx) {
    ctx.provide('testAnalyzeIsolatedService', {})
  },
  testAnalyzeMailerProvider(ctx) {
    ctx.provide('testAnalyzeMailer', {})
  },
} satisfies Record<string, Plugin.Function>

interface PluginAnalyzerGatewayFace {
  snapshot(): PluginAnalyzerSnapshot
}

function analyzerSnapshot(scaffold: WebScaffold): PluginAnalyzerSnapshot {
  return (scaffold.ctx.get('pluginAnalyzer') as PluginAnalyzerGatewayFace).snapshot()
}

function fixtureDiagnosisKinds(snapshot: PluginAnalyzerSnapshot): Record<string, readonly string[]> {
  return Object.fromEntries(snapshot.entries
    .filter(entry => FIXTURE_IDS.some(id => entry.entryId.endsWith(id)))
    .map(entry => [
      FIXTURE_IDS.find(id => entry.entryId.endsWith(id))!,
      entry.diagnoses.map(diagnosis => diagnosis.kind),
    ]))
}

function normalizeDiagnosticSnapshot(snapshot: string): string {
  return snapshot
    .replace(/\b[0-9a-f]{8}:(test-analyze-[a-z-]+)/g, '{{loader-parent}}:$1')
    .replace(/Fiber #\d+/g, 'Fiber #{{fiber}}')
    .replace(/\d{4}-\d{2}-\d{2}T\{\{clock\}\}Z/g, '{{observedAt}}')
}

describe('web e2e: Plugin Analyzer diagnostic fixtures', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      extraOverlayPath: [
        `${PLUGIN_ANALYZER_ROOT}cordis.patch.yml`,
        `${FIXTURE_ROOT}cordis.patch.yml`,
      ],
      extraInstallAnchors: [
        `${PLUGIN_ANALYZER_ROOT}package.json`,
        `${FIXTURE_ROOT}package.json`,
      ],
      loaderBuiltins: LOADER_BUILTINS,
    })

    const missingRoot = [...scaffold.ctx.loader.entries()]
      .find(entry => entry.options.id === 'test-analyze-missing-root')
    if (missingRoot === undefined) throw new Error('missing-root fixture Loader entry was not composed')
    await missingRoot.fiber?.dispose()

    await new Promise(resolve => setImmediate(resolve))
    expect(fixtureDiagnosisKinds(analyzerSnapshot(scaffold))).toEqual({
      'test-analyze-missing-dependency': ['missing-dependency'],
      'test-analyze-isolation-mismatch': ['missing-dependency', 'isolation-mismatch'],
      'test-analyze-fiber-failed': ['fiber-failed'],
      'test-analyze-missing-root': ['missing-root'],
    })
    expect(analyzerSnapshot(scaffold).summary.diagnosed).toBe(4)

    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('renders all Host diagnoses, narrow layout, evidence, and the repaired transition', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-plugin-analyzer-diagnostics'))
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.getByRole('button', { name: '插件', exact: true }).click()
    await dialog.getByRole('tab', { name: '插件分析', exact: true }).click()

    const attention = dialog.getByRole('tab', { name: /需关注/ })
    await expect.poll(() => attention.getAttribute('aria-selected'), { timeout: 10_000 }).toBe('true')
    expect(await dialog.locator('[data-plugin-analyzer-entry]').count()).toBe(4)
    expect(await dialog.locator('[data-analyzer-count="diagnosed"] dd').textContent()).toBe('4')
    expect(await dialog.locator('[data-analyzer-count="missing-dependencies"] dd').textContent()).toBe('2')
    expect(await dialog.locator('[data-plugin-analyzer-view="all"] strong').textContent())
      .toBe(String(analyzerSnapshot(scaffold).summary.enabled))

    const visibleIds = await dialog.locator('[data-plugin-analyzer-entry]').evaluateAll(elements =>
      elements.map(element => element.getAttribute('data-plugin-analyzer-entry')
        ?.split(/[:$]/).at(-1)))
    expect(visibleIds).toEqual(FIXTURE_IDS)

    const missingDependency = dialog.locator('[data-plugin-analyzer-entry$="test-analyze-missing-dependency"]')
    const isolationMismatch = dialog.locator('[data-plugin-analyzer-entry$="test-analyze-isolation-mismatch"]')
    const fiberFailed = dialog.locator('[data-plugin-analyzer-entry$="test-analyze-fiber-failed"]')
    const missingRoot = dialog.locator('[data-plugin-analyzer-entry$="test-analyze-missing-root"]')

    expect(await missingDependency.locator('[data-diagnosis-kind]').getAttribute('data-diagnosis-kind'))
      .toBe('missing-dependency')
    expect(await missingDependency.textContent()).toContain('所需服务不可用')
    expect(await missingDependency.textContent()).toContain('testAnalyzeMailer')
    expect(await isolationMismatch.locator('[data-diagnosis-kind]').getAttribute('data-diagnosis-kind'))
      .toBe('isolation-mismatch')
    expect(await isolationMismatch.locator('[data-diagnosis-kind]').getAttribute('data-severity')).toBe('warning')
    expect(await isolationMismatch.textContent()).toContain('其他 isolation 位置有 testAnalyzeIsolatedService 的提供方')
    expect(await fiberFailed.locator('[data-diagnosis-kind]').getAttribute('data-diagnosis-kind')).toBe('fiber-failed')
    expect(await fiberFailed.textContent()).toContain('子插件启动失败')
    expect(await fiberFailed.textContent()).toContain('testAnalyzeFailedChild')
    expect(await fiberFailed.textContent()).toContain('Error: private test fixture failure')
    expect(await missingRoot.locator('[data-diagnosis-kind]').getAttribute('data-diagnosis-kind')).toBe('missing-root')
    expect(await missingRoot.textContent()).toContain('这条插件仍是启用的，但根 Fiber 已经没了')
    for (const row of [missingDependency, isolationMismatch, fiberFailed, missingRoot]) {
      expect(await row.textContent()).toContain('直接影响')
      expect(await row.textContent()).toContain('传递影响')
      expect(await row.textContent()).toContain('观测时间')
      expect(await row.locator('button[aria-expanded]').getAttribute('aria-expanded')).toBe('false')
    }

    const evidence = isolationMismatch.locator('button[aria-expanded]')
    await evidence.click()
    expect(await evidence.getAttribute('aria-expanded')).toBe('true')
    expect(await isolationMismatch.locator('[data-analyzer-diagnoses]').textContent())
      .toContain('missing-dependency')
    expect(await isolationMismatch.locator('[data-analyzer-diagnoses]').textContent())
      .toContain('isolation-mismatch')
    expect(await isolationMismatch.textContent()).toContain('仅注册信息')

    const snapshot = normalizeDiagnosticSnapshot(await captureStableAria(
      page,
      '[data-plugin-analyzer-diagnosis]',
      scaffold.workspaceCwd,
    ))
    await compareOrRefreshGolden(EXPECTED, snapshot, MODE)

    await page.setViewportSize({ width: 640, height: 1000 })
    expect(await dialog.locator('[data-plugin-analyzer-summary]').evaluate(element =>
      getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2)
    expect(await isolationMismatch.locator('[data-diagnosis-kind]').evaluate(element =>
      getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1)
    await page.setViewportSize({ width: 1680, height: 1000 })

    await scaffold.ctx.loader.create({ name: 'cordis:testAnalyzeMailerProvider' })
    await scaffold.ctx.loader.await()
    await dialog.getByRole('button', { name: '刷新', exact: true }).click()
    await expect.poll(
      () => dialog.locator('[data-analyzer-count="diagnosed"] dd').textContent(),
      { timeout: 10_000 },
    ).toBe('3')
    expect(await dialog.locator('[data-plugin-analyzer-entry$="test-analyze-missing-dependency"]').count()).toBe(0)
    await dialog.getByRole('tab', { name: /全部插件/ }).click()
    const repaired = dialog.locator('[data-plugin-analyzer-entry$="test-analyze-missing-dependency"]')
    await repaired.waitFor({ timeout: 10_000 })
    expect(await repaired.getAttribute('data-status')).toBe('running')
    expect(await repaired.getAttribute('data-diagnosed')).toBe('false')
    expect(await repaired.textContent()).toContain('当前快照未记录诊断')

    const repairedProfile = analyzerSnapshot(scaffold).entries
      .find(entry => entry.entryId.endsWith('test-analyze-missing-dependency'))
    expect(repairedProfile).toMatchObject({ rootPhase: 'active', diagnoses: [] })
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)
})
