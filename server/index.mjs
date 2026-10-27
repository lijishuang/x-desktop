import { createServer } from './app.mjs'
import { config } from './config.mjs'
import { llmMode } from './services/llm.mjs'
import { state, save } from './store/store.mjs'
import { startPrimary } from './services/pipeline.mjs'

const server = createServer()

server.listen(config.port, config.host, () => {
  const base = `http://${config.host}:${config.port}`
  console.log('┌─ X-DeskTop ─ 7×24 自主测试工厂')
  console.log(`│  界面   ${base}/`)
  console.log(`│  接口   ${base}/api/health   ${base}/api/snapshot   ${base}/api/stream`)
  console.log(`│  模型   ${llmMode() === 'live' ? 'live（卡片 Key 或环境变量已配置）' : '未配置：在模型页供应商卡片粘贴 API Key，或设置 LLM_BASE_URL / LLM_API_KEY'}`)
  console.log(`│  数据   ${config.dataFile}`)
  console.log(`│  任务线 ${state.lanes.length} 条 · 用例 ${state.cases.length} 条 · 缺陷 ${state.defects.length} 条`)
  console.log('└─ Ctrl+C 退出')
  if (config.autoStart) startPrimary()
})

let closing = false
const shutdown = () => {
  if (closing) return
  closing = true
  console.log('\n[server] 正在保存数据并退出…')
  save()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1500)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
