/** Copy dictionaries for the Plugin Doctor Settings tab. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  tab: '插件诊断',
  loading: '正在检查已启用插件…',
  error: '暂时无法检查插件状态。',
  retry: '重试',
  refresh: '刷新',
  enabledCount: '已启用',
  runningCount: '运行中',
  nonRunningCount: '非运行中',
  empty: '没有已启用插件。',
  running: '运行中',
  pending: '等待中',
  starting: '启动中',
  failed: '失败',
  stopping: '停止中',
  notMounted: '未挂载',
  entryId: 'Loader 条目',
  cordisPhase: 'Cordis 阶段',
  noPhase: '无',
} satisfies Record<string, string>

/** Plugin Doctor locale key union. */
export type PluginDoctorLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  tab: 'Plugin Doctor',
  loading: 'Checking enabled plugins…',
  error: 'Plugin status is temporarily unavailable.',
  retry: 'Retry',
  refresh: 'Refresh',
  enabledCount: 'Enabled',
  runningCount: 'Running',
  nonRunningCount: 'Non-running',
  empty: 'No plugins are enabled.',
  running: 'Running',
  pending: 'Pending',
  starting: 'Starting',
  failed: 'Failed',
  stopping: 'Stopping',
  notMounted: 'Not mounted',
  entryId: 'Loader entry',
  cordisPhase: 'Cordis phase',
  noPhase: 'None',
} satisfies Record<PluginDoctorLocaleKey, string>
