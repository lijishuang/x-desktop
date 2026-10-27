/**
 * 初始数据（种子）
 * 用确定性伪随机保证每次 reset 后的数据一致，便于对照与测试。
 */

export const ROLES = [
  { k: 'plan', id: 'T-01', n: 'KEEL', role: '测试方案', task: '拆解验收标准 · 输出测试策略', up: '2h14m' },
  { k: 'req', id: 'T-02', n: 'ORACLE', role: '需求分析', task: '抽取测试点 · 澄清歧义', up: '1h58m' },
  { k: 'case', id: 'T-03', n: 'WEAVE', role: '用例设计', task: '生成用例 · 维护追溯矩阵', up: '3h02m' },
  { k: 'run', id: 'T-04', n: 'SWARM', role: '自动执行', task: '调度执行机 · 重试失败用例', up: '7h41m' },
  { k: 'bug', id: 'T-05', n: 'SENTRY', role: '缺陷定级', task: '归并去重 · 定级派单', up: '4h26m' },
]

export const STAGES = [
  { k: 'plan', n: 'KEEL', label: '测试方案', desc: '范围 / 策略 / 准入准出' },
  { k: 'req', n: 'ORACLE', label: '需求分析', desc: '测试点 / 追溯矩阵' },
  { k: 'case', n: 'WEAVE', label: '用例设计', desc: '用例 / 数据 / 断言' },
  { k: 'run', n: 'SWARM', label: '自动执行', desc: '执行机池 / 失败重试' },
  { k: 'bug', n: 'SENTRY', label: '缺陷定级', desc: '归并 / 定级 / 报告' },
]

export const PROVIDERS = [
  {
    id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1',
    keyMask: 'sk-••••••7f2a', models: ['deepseek-chat', 'deepseek-reasoner'],
    window: 128000, priceIn: 0.28, priceOut: 0.42, enabled: true, calls: 12840, latency: 640,
  },
  {
    id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1',
    keyMask: 'sk-••••••91c3', models: ['gpt-4.1', 'gpt-4.1-mini'],
    window: 200000, priceIn: 2.5, priceOut: 10, enabled: true, calls: 3120, latency: 820,
  },
  {
    id: 'anthropic', name: 'Anthropic', endpoint: 'https://api.anthropic.com/v1',
    keyMask: 'sk-ant-••••••4d10', models: ['claude-sonnet-4', 'claude-haiku-4'],
    window: 200000, priceIn: 3, priceOut: 15, enabled: true, calls: 1860, latency: 910,
  },
  {
    id: 'qwen', name: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyMask: 'sk-••••••e8b7', models: ['qwen3-max', 'qwen3-coder-plus'],
    window: 131072, priceIn: 0.4, priceOut: 1.2, enabled: false, calls: 0, latency: 700,
  },
  {
    id: 'local', name: '本地 vLLM', endpoint: 'http://127.0.0.1:8000/v1',
    keyMask: 'local · 无密钥', models: ['qwen2.5-coder:32b', 'llama-3.3-70b'],
    window: 32768, priceIn: 0, priceOut: 0, enabled: true, calls: 9640, latency: 120,
  },
]

/** 角色 → 模型绑定：按能力/成本分工，可被实例级覆盖 */
export const BINDINGS = {
  plan: { providerId: 'anthropic', model: 'claude-sonnet-4', temperature: 0.3, budget: 120000, why: '长上下文强推理，适合拆解验收标准与策略' },
  req: { providerId: 'openai', model: 'gpt-4.1', temperature: 0.2, budget: 96000, why: '结构化抽取稳定，测试点不漏项' },
  case: { providerId: 'deepseek', model: 'deepseek-reasoner', temperature: 0.5, budget: 64000, why: '边界与异常覆盖更全' },
  run: { providerId: 'local', model: 'qwen2.5-coder:32b', temperature: 0.1, budget: 32000, why: '本地零成本，执行脚本生成够用' },
  bug: { providerId: 'deepseek', model: 'deepseek-chat', temperature: 0.2, budget: 48000, why: '归并定级，便宜且快' },
}

const REQ_SEED = [
  { id: 'REQ-101', t: '订单支付回调需支持重复通知幂等，重复回调不得重复扣款', mod: 'order-payment', points: 12, covered: 12, st: 'confirmed' },
  { id: 'REQ-102', t: '退款金额按分存储，展示时按元换算，四舍五入保留 2 位', mod: 'settle-job', points: 9, covered: 9, st: 'confirmed' },
  { id: 'REQ-103', t: '大促期间网关限流阈值可动态配置，超阈值返回 429 并给重试建议', mod: 'gateway-core', points: 8, covered: 6, st: 'reviewing' },
  { id: 'REQ-104', t: '优惠券叠加规则：互斥券不可同时使用，需给出冲突提示', mod: 'promo-center', points: 10, covered: 4, st: 'reviewing' },
  { id: 'REQ-105', t: '用户注销后 30 天内可撤回，撤回后恢复全部权益', mod: 'account', points: 8, covered: 8, st: 'confirmed' },
  { id: 'REQ-106', t: '库存预占超时 15 分钟自动释放，释放需幂等', mod: 'stock', points: 9, covered: 3, st: 'draft' },
  { id: 'REQ-107', t: '报表导出单次上限 5 万行，超出提示分批导出', mod: 'report', points: 7, covered: 2, st: 'draft' },
  { id: 'REQ-108', t: '支付渠道降级：主渠道超时 800ms 自动切备渠道', mod: 'pay-route', points: 11, covered: 9, st: 'reviewing' },
]

const CASE_TEMPLATES = {
  'order-payment': [
    ['重复回调不得重复扣款', 'P0'],
    ['回调乱序到达仍保持最终一致', 'P1'],
    ['签名校验失败拒绝处理并告警', 'P0'],
    ['支付成功但通知丢失走对账补偿', 'P1'],
    ['部分退款后再次全额退款被拦截', 'P2'],
  ],
  'settle-job': [
    ['退款金额按分存储，展示按元换算', 'P0'],
    ['四舍五入边界 0.005 处理正确', 'P1'],
    ['对账文件缺行时容错跳过', 'P1'],
    ['批量结算分片顺序与幂等', 'P2'],
  ],
  'gateway-core': [
    ['限流阈值动态生效无需重启', 'P0'],
    ['超阈值返回 429 与 Retry-After', 'P0'],
    ['白名单流量绕过限流', 'P1'],
    ['突发流量削峰后自动恢复', 'P2'],
  ],
  'promo-center': [
    ['互斥券不可同时使用', 'P0'],
    ['叠加冲突提示文案准确', 'P1'],
    ['券过期瞬间的并发使用', 'P1'],
    ['折扣与满减叠加顺序正确', 'P2'],
  ],
  account: [
    ['注销 30 天内撤回恢复全部权益', 'P0'],
    ['超期注销不可撤回', 'P1'],
    ['撤回时积分与等级返还', 'P1'],
    ['注销期间登录被拦截', 'P2'],
  ],
  stock: [
    ['预占 15 分钟超时自动释放', 'P0'],
    ['释放接口重复调用保持幂等', 'P0'],
    ['高并发下单不超卖', 'P1'],
    ['预占与取消并发时数据一致', 'P1'],
  ],
  report: [
    ['导出 5 万行上限生效', 'P1'],
    ['超限时提示分批导出', 'P2'],
    ['导出任务中断可续传', 'P2'],
  ],
  'pay-route': [
    ['主渠道超时 800ms 切备渠道', 'P0'],
    ['双渠道均超时给出降级提示', 'P1'],
    ['切换后订单状态保持一致', 'P1'],
  ],
}

const DEFECT_SEED = [
  ['重复回调并发场景下occasionally重复扣款', 'P0', 'new', 'TC-1001'],
  ['限流阈值热更新后旧连接仍按旧阈值放行', 'P1', 'reproduced', 'TC-1011'],
  ['导出超限提示文案缺少分批条数', 'P2', 'fixing', 'TC-1033'],
  ['券过期瞬间并发使用导致一次抵扣两次', 'P1', 'fixing', 'TC-1018'],
  ['库存释放接口重复调用返回 500', 'P1', 'verified', 'TC-1026'],
  ['退款四舍五入 0.005 边界展示为 0.00', 'P2', 'closed', 'TC-1006'],
  ['注销撤回后会员等级未恢复', 'P1', 'new', 'TC-1021'],
  ['备渠道切换后订单状态短暂为“支付中”', 'P2', 'reproduced', 'TC-1036'],
  ['对账文件缺行时任务整体失败而非跳过', 'P1', 'verified', 'TC-1008'],
  ['报表导出中断后无法续传', 'P2', 'new', 'TC-1035'],
  ['白名单规则命中后被限流', 'P0', 'reproduced', 'TC-1012'],
  ['突发流量削峰后限流未自动恢复', 'P2', 'closed', 'TC-1013'],
]

export function createInitialState() {
  const now = Date.now()
  const at = min => new Date(now - min * 60000).toISOString()
  let caseNo = 1001
  let defectNo = 1
  let resultNo = 1
  let logNo = 1
  let tlNo = 1

  const requirements = REQ_SEED.map((r, i) => ({ ...r, laneId: 'L-01', createdAt: at(600 - i * 37) }))

  const cases = []
  for (const req of requirements) {
    const tpl = CASE_TEMPLATES[req.mod] || [['默认用例', 'P1']]
    for (const [title, pri] of tpl) {
      cases.push({
        id: `TC-${caseNo++}`,
        reqId: req.id,
        t: title,
        mod: req.mod,
        pri,
        on: true,
        res: 'skip',
        dur: 0,
        laneId: 'L-01',
        createdAt: at(400 - cases.length * 9),
      })
    }
  }

  // 种入一批历史执行结果：约 93% 通过
  const results = []
  const runHistory = []
  const runId = 'RUN-2401'
  cases.forEach((c, i) => {
    const executed = i < 26
    if (!executed) return
    const pass = i % 14 !== 5
    c.res = pass ? 'pass' : 'fail'
    c.dur = 0.8 + ((i * 7) % 90) / 10
    results.push({
      id: `R-${resultNo++}`,
      runId,
      caseId: c.id,
      ex: `swarm-0${(i % 8) + 1}`,
      res: c.res,
      dur: c.dur,
      at: at(300 - i * 4),
    })
  })

  const run = {
    id: runId,
    laneId: 'L-01',
    batch: 'release/4.2 · 回归',
    total: cases.length,
    done: results.length,
    pass: results.filter(r => r.res === 'pass').length,
    fail: results.filter(r => r.res === 'fail').length,
    st: 'done',
    at: at(312),
    endAt: at(280),
  }

  const history = [
    ['RUN-2400', 'release/4.1 · 回归', 128, 128, 121, 7, 'done', 1440],
    ['RUN-2399', 'release/4.1 · 冒烟', 42, 42, 42, 0, 'done', 1520],
    ['RUN-2398', 'release/4.0 · 回归', 126, 126, 117, 9, 'done', 1610],
    ['RUN-2397', '迭代 4.0 · 支付链路', 58, 58, 55, 3, 'done', 1700],
    ['RUN-2396', 'release/4.0 · 冒烟', 42, 42, 41, 1, 'done', 1810],
    ['RUN-2395', '迭代 3.9 · 全量', 132, 132, 120, 12, 'done', 2900],
  ].map(([id, batch, total, done, pass, failN, st, min]) => ({
    id, laneId: 'L-01', batch, total, done, pass, fail: failN, st, at: at(min), endAt: at(min - 40),
  }))

  const defects = DEFECT_SEED.map(([t, sev, st, caseId]) => ({
    id: `BUG-${String(defectNo++).padStart(4, '0')}`,
    caseId,
    t,
    sev,
    st,
    laneId: 'L-01',
    at: at(280 - defectNo * 11),
  }))

  const lanes = [
    {
      id: 'L-01',
      no: 1,
      name: '常驻回归 · PIPE-07',
      batch: 'release/4.2',
      status: 'queued',
      primary: true,
      stages: { plan: 0, req: 0, case: 0, run: 0, bug: 0 },
      gates: { plan: true, req: true, case: true, run: true, bug: true },
      req: requirements.length,
      cases: cases.length,
      pass: run.pass,
      fail: run.fail,
      slots: 3,
      reqIds: requirements.map(r => r.id),
      createdAt: at(360),
      finishedAt: null,
    },
  ]

  const contextItems = [
    ['KEEL', 'plan', '测试方案：范围=release/4.2 全量回归；策略=风险优先（支付/订单 P0 先行）；准出=通过率≥95% 且无遗留 P0。', 520],
    ['ORACLE', 'req', '追溯矩阵：8 条需求 → 33 个测试点，其中 3 处歧义已向产品确认（退款退回路径、券过期边界、备渠道状态）。', 380],
    ['WEAVE', 'case', '用例集：33 条用例，P0 12 / P1 14 / P2 7，覆盖等价类、边界值、并发与幂等四类方法。', 460],
  ].map(([author, role, text, tokens], i) => ({
    id: `CTX-${i + 1}`,
    laneId: 'L-01',
    author: `${author}·1`,
    role,
    model: BINDINGS[role].model,
    text,
    tokens,
    at: at(300 - i * 40),
  }))

  const logs = [
    ['sys', '流水线 PIPE-07 已就绪 · 分支 release/4.2 · 环境 staging-sim'],
    ['sys', '[KEEL·1] 测试方案评审通过 · 准出标准已下发'],
    ['sys', '[ORACLE·1] 需求澄清：3 处歧义已确认，测试点 33 个'],
    ['pass', '[WEAVE·1] 用例生成完成 · 33 条（P0 12 / P1 14 / P2 7）'],
    ['pass', '[SWARM·1] TC-1001 通过 · 1.4s'],
    ['fail', '[SWARM·1] TC-1005 断言失败：期望 200，实际 429'],
    ['warn', '[SWARM·1] TC-1005 重试 1/2 后仍失败 · 已转 SENTRY'],
    ['pass', '[SWARM·3] TC-1010 通过 · 2.1s'],
  ].map(([level, text], i) => ({
    id: `LG-${logNo++}`, laneId: 'L-01', level, text, at: at(300 - i * 6),
  }))

  const timeline = [
    ['cyan', 'KEEL·1 测试方案评审通过 · 准出阈值 95%'],
    ['blue', 'ORACLE·1 澄清 3 处需求歧义 · 测试点 33 个'],
    ['violet', 'WEAVE·1 用例自愈：2 条断言补全'],
    ['lime', 'SWARM·1 冒烟批次通过 · 42/42'],
    ['magenta', 'SENTRY·1 发现 P0：重复回调并发重复扣款 · 已阻塞准入'],
    ['amber', 'OPS 环境快照 staging-sim-241026-03 已保留 72h'],
    ['cyan', 'KEEL·1 追加边界策略：券过期 ±500ms 抖动测试'],
    ['blue', 'ORACLE·1 追溯矩阵覆盖率 100%'],
  ].map(([tone, text], i) => ({
    id: `TL-${tlNo++}`, tone, text, at: at(320 - i * 18),
  }))

  return {
    meta: { version: '0.1.0', startedAt: new Date(now - 218 * 3600 * 1000).toISOString(), seededAt: new Date(now).toISOString() },
    scheduler: { conc: 2 },
    pool: { cap: Number(process.env.EXEC_POOL_CAP || 8), used: 0 },
    counters: { reqSeq: 108, caseSeq: caseNo - 1, defectSeq: defectNo - 1, laneSeq: 1, runSeq: 2401 },
    requirements,
    cases,
    lanes,
    runs: [...history, run],
    results,
    defects,
    contextItems,
    models: {
      providers: PROVIDERS,
      bindings: BINDINGS,
      overrides: {},          // { 'L-02|case': { providerId, model, temperature } }
      calls: [],
    },
    logs,
    timeline,
    importBatches: [],
  }
}
