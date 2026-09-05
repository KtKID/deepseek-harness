// dsh-rimworld-lab 是纯组合层 bundle:它的全部内容是 cordis.patch.yml 的两行
// mcp-client insert,加载器从不把这个包当模块导入。此入口文件仅为包管理器与
// 插件市场的 manifest 健康检查提供存在的入口产物(不存在的入口会被标为 broken)。
export {}
