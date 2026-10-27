# X-DeskTop API

所有接口前缀 `/api`，返回统一结构 `{ ok, data }` 或 `{ ok: false, error: { message } }`。

## 系统

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查（版本 / 运行时长 / 模型模式 / 规模） |
| GET | `/api/snapshot` | 首屏全量快照（KPI、任务线、需求、用例、缺陷、模型、上下文） |
| GET | `/api/stream` | SSE 实时事件流（`lane/log/result/run/defect/timeline/context/llm/pool/...`），支持 `Last-Event-ID` 断线续传 |
| GET | `/api/config` | 运行配置（模型模式、节奏、池容量） |
| POST | `/api/admin/reset` | 重置回种子数据（演示/测试用） |
| GET | `/api/logs?limit=60` | 最近日志 |
| GET | `/api/timeline?limit=24` | 最近时间线事件 |

## 需求

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/requirements` | 需求列表（含覆盖派生字段） |
| POST | `/api/requirements/preview` | `{ text }` → 解析预览，不落库 |
| POST | `/api/requirements/import` | `{ text, batch }` → 建需求 + **新建任务线**并入队执行 |
| PATCH | `/api/requirements/:id` | `{ st }` 或空体推进状态：`draft → reviewing → confirmed` |

需求文本格式：每行一条，`标题 | 模块 | 测试点数`（后两项可省略），`#` 开头为注释，最多 12 行。

## 用例

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/cases?mod=&pri=&q=` | 用例列表（可筛选） |
| POST | `/api/cases` | `{ t, mod, pri, reqId? }` 新建 |
| PATCH | `/api/cases/:id` | `{ on?, pri?, t? }` 停用/改级/改名 |
| DELETE | `/api/cases/:id` | 删除 |

## 任务线与调度

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/lanes` | 任务线列表 + 调度器 + 执行机池 |
| POST | `/api/lanes/:id/gates/:role` | `{ on }` 单实例启停（`plan/req/case/run/bug`），停掉的阶段真实冻结 |
| POST | `/api/lanes/:id/freeze` | 整线冻结（进度保留） |
| POST | `/api/lanes/:id/resume` | 重新排队续跑 |
| PATCH | `/api/scheduler` | `{ conc: 1~4 }` 并行度 |

## 运行与缺陷

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/runs` | 进行中 + 历史批次 |
| GET | `/api/runs/:id/results?limit=60` | 某批次的逐条结果 |
| GET | `/api/results?limit=60` | 最近结果 |
| GET | `/api/defects?sev=P0` | 缺陷列表 |
| PATCH | `/api/defects/:id` | `{ st }` 或空体沿 `new → reproduced → fixing → verified → closed` 流转 |

## 模型

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/models` | 供应商 / 角色绑定 / 实例覆盖 / 调用记录 / 上下文 |
| POST | `/api/models/providers/:id/test` | 供应商探活（返回握手延迟） |
| PATCH | `/api/models/providers/:id` | `{ enabled?, keyMask? }` |
| PATCH | `/api/models/bindings/:role` | `{ providerId?, model?, temperature?, budget? }` |
| PUT | `/api/models/overrides/:laneId/:role` | 实例级覆盖（该任务线的该角色用别的模型） |
| DELETE | `/api/models/overrides/:laneId/:role` | 清除覆盖 |
| GET | `/api/models/context/:laneId` | 任务线的共享上下文（条目 / token / 压缩次数） |
| GET | `/api/models/prompt/:laneId/:role` | 组装后的实际 Prompt（SYSTEM/MODEL/SHARED CONTEXT/…） |

## SSE 事件一览

| 事件 | 载荷 | 前端用途 |
| --- | --- | --- |
| `lane` | laneView（含 stages/gates/pct） | 流水线进度、任务线卡 |
| `result` | 单条执行结果 | KPI、结果流、用例最近结果 |
| `run` | 运行记录 | ACTIVE RUN 大数字 |
| `log` | 日志行 | 终端 |
| `defect` | 缺陷 | 缺陷流 + KPI |
| `timeline` | 时间线事件 | ACTIVITY TIMELINE |
| `context` | `{ laneId, item?, total }` | 上下文总线 |
| `llm` | 模型调用记账 | 模型页调用记录 |
| `pool` | `{ cap, used }` | 执行机池 |
| `scheduler` | `{ conc }` | 并行度 |
