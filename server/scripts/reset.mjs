import fs from 'node:fs'
import { config } from '../config.mjs'

if (fs.existsSync(config.dataFile)) {
  fs.rmSync(config.dataFile)
  console.log(`[reset] 已删除 ${config.dataFile}，下次启动会重建种子数据`)
} else {
  console.log('[reset] 没有持久化文件，无需重置')
}
