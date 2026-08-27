# 04. 工作流:命令、Agent 角色与渐进读取协议

## 1. 公开命令

| 命令 | 目的 | 触发 | 主 assistant 可建议 |
|---|---|---|---|
| `init` | 为无 llmdoc 的项目首次建立知识体系 | 显式调用 | 项目缺 llmdoc 时,仅建议 |
| `update` | 按历史有效版本、当前代码差异与反思候选同步知识 | 显式调用 | 存在持久知识变化或 pending 反思候选时,确认后执行 |
| `prune` | 收敛重复、碎片与膨胀的知识 | 显式调用 | update 后命中 growth gate 时,确认后执行 |
| `upgrade` | 迁移旧 major 结构(V2 → V3) | **仅显式调用,永不建议** | 否 |

授权模型:手动调用即授权该次声明 scope;主动建议须获得一次确认,确认后完整运行不再二次确认;scope 异常扩张时暂停重新询问。

## 2. Agent 角色(三个)

| Agent | 证据来源 | 可写 | 禁止写 | 职责 |
|---|---|---|---|---|
| **Investigator** | 代码、配置、git、现有文档 | `.llmdoc-tmp/investigations/` | `llmdoc/`、`meta.json` | 工程事实调查、影响面确认、缺口与冲突识别;报告必须区分事实/推断/未验证假设 |
| **Reflector** | 任务摘要、用户纠正、验证失败、返工证据、相关代码/文档 | `.llmdoc-tmp/reflections/pending/` | `llmdoc/`、`meta.json`、源码 | 把强信号改写为隐私安全的结构化晋升候选;不保存完整 transcript |
| **Recorder** | CLI 报告、调查报告、现有知识 | `llmdoc/` 与 `meta.json`(经 02 的 git-based 协议) | 源码 | 唯一正式知识写入者:topic 边界、kind 选择、front matter、正文颗粒度、新建/改写/合并/删除 |

变化说明:V2 的 Worker 仍由宿主 assistant 取代;Reflector 以受限形式恢复,只承担强信号候选捕获,不恢复 reflection kind、tracked memory 树或案例数量阈值。稳定经验仍由 Recorder 在 update 中回灌(见 4.2)。

主 assistant 负责:与用户对齐和授权、识别强反思信号、选择命令与 scope、依据 CLI 信号选 light/deep、汇总报告、维护 LLMDOC_STATE。它不绕过 Recorder 直接改 `llmdoc/`,也不把调查报告或对话全文注入长期上下文。

## 3. 渐进读取协议(Operating)

### 3.1 日常任务

```text
SessionStart hook → 一行状态信号
→ (需要 llmdoc 时) llmdoc tree                      # 动态全局地图:根单例 + topics + descriptions
→ llmdoc index --topic <t>                          # topic 内文档元数据
→ llmdoc context --files <要改的文件> / search      # 定位候选
→ llmdoc show <少量文档>                            # 只读确有价值的正文
```

每一层都允许停止。没有固定 startup pack;读多少由任务决定。CLI 是强制外部工具,`tree` 就是根入口——不存在"先找 index.md"这一步。

### 3.2 Compact continuation

Compact summary 必须保存 `LLMDOC_STATE`:active goal、已读文档路径、关键结论、用户决策、pending lesson candidates、下一步、未决风险。

```text
同一任务 + LLMDOC_STATE 足够 + 相关文档未变化
→ 零重读(第一个动作不得重读 index/已读正文)
```

仅在状态不足、相关文档已变、进入新 topic、任务改变或证据冲突时做 targeted refresh。

### 3.3 任务结束

主 assistant 判断(hook stop 只给 best-effort 提醒):

1. 是否出现强反思信号(用户明确纠正、验证证明方案错误、重大返工/回滚、指令违规或可复用 missing signal)→ 由 Reflector 写 pending 候选;
2. 是否有持久知识变化或 pending 候选 → 简述原因并确认后运行 update;候选本身就是 update 信号,不依赖代码 delta;
3. 是否值得留一般过程记录 → 由主 assistant 判断,写 `.llmdoc-tmp/records/`;
4. 仅实现细节变化、无强信号且文档仍准确 → 不建议。

## 4. 命令 SOP

### 4.1 Init

```text
preflight: 确认 llmdoc/ 不存在(存在有效 V3 → 拒绝并建议 update;V2 → 建议 upgrade)
→ CLI 仓库 inventory(语言、入口、构建、测试、主要源码表面)
→ 多个 Investigator 按互补主题调查(能力/数据流/集成/构建发布/横切约定)
→ coverage 检查与 follow-up(补缺口、解决冲突)
→ Recorder bootstrap:定 topic 集合 → 写根 architecture.mdx + 各 topic 按需文档(无入口节点)
→ llmdoc validate 门控 → 生成 meta.json(baseline + convergence)
```

要点:先定 topic 边界再写正文;**不生成根 index**(地图由 `llmdoc tree` 动态承担);只创建支撑高价值知识的文档,不求全(自动生成的大而全入口已被实践证明有害);不生成空 folder。

### 4.2 Update(light / deep)

```text
llmdoc status/delta → 影响闭包 + unmapped paths + 模式信号
--reflection → 读取显式候选;未给路径时读取 pending/ 下全部 Markdown 候选
→ 质量门:验证 trigger、错误动作、root cause、预防规则、scope、confidence 与 existing owner
light: 影响明确、全部映射到现有文档、无结构变化
  → Recorder 直接同步受影响文档 → validate → fingerprint --update
deep: 存在 unmapped 区域 / lesson owner 或 root cause 不清 / topic 结构变化 / baseline 不可用 / 事实冲突 / 闭包过大
  → Investigator(可多个并行)调查 → Recorder 综合写入 → validate → fingerprint
```

- Light 中发现未知影响必须升级 deep,升级不需要例行二次授权,scope 超出授权才暂停;
- 更新的是**当前有效状态**,不记录中间 commit 历史;
- 优先改写/合并现有文档,现有边界装不下才新建;
- 局部 scope 只刷新对应文档的 `validatedRevision`,不推进 baseline。

**经验回灌**:Reflector 候选是临时证据队列,不是稳定文档。Recorder 必须先用 `search/show` 找 owner 并验证事实;成熟经验改写进相关 architecture/guide 的正文,作为不变量、反例或注意事项。用户纠正能证明用户意图,仓库事实仍须代码、测试或稳定文档证据。瞬时工具失败、单任务偏好和未验证推测不晋升。success 后候选移入 `.llmdoc-tmp/reflections/resolved/YYYY-MM-DD/`;incomplete/failed 时继续 pending。

### 4.3 Prune

触发:update success 后 CLI 比较当前规模与 `convergence` baseline,命中 growth gate(如 token 总量增长超阈值)→ 主 assistant 说明原因,询问一次。

```text
llmdoc prune --report(规模、重复候选、碎片候选)
→ Recorder 制定收敛 plan(merge/rewrite/delete,每个被删节点映射到存续目标)
→ 执行 → validate → 确认规模实际下降且 code.paths 覆盖不下降
→ 刷新 convergence baseline
```

禁止:archive 式假收敛(把文档移出读取路径充当规模下降)、按时间无脑删除、为字节数牺牲有效约束。规模未降或覆盖下降 → 不得报告 success、不刷新 convergence。

### 4.4 Upgrade(V2 → V3)

独立子系统,与核心 prompt 物理隔离,正常任务上下文零出现。职责:

- V2 结构(`index.md`/`startup.md`/`must/`/`overview/`/`memory/`…)→ V3(根单例 + topic);
- `index.md`+`must/`+`overview/` 中仍有效的内容合并进根 `architecture.mdx` 与各 topic;`memory/decisions|reflections` 中仍有效的结论回灌进对应 architecture/guide,其余丢弃;
- `state/sync.md` watermark → `meta.json` baseline;
- 迁移前提示用户 git 备份;迁移在单独 commit 中完成,可整体 revert。

## 5. `.llmdoc-tmp/` 布局

```text
.llmdoc-tmp/            # git-ignored,删除不影响正式知识
├── cache/              # 搜索索引等,可再生
├── investigations/     # Investigator 调查报告
├── reflections/
│   ├── pending/        # Reflector 生成的强信号候选
│   └── resolved/       # 已晋升、已覆盖或已驳回的候选
└── records/            # 工作记录、过去的 plan、会话沉淀原料
```

records 与 reflections 都不进入常规知识检索。hooks 只统计 pending Markdown 文件并发出短状态信号,不读取内容或 transcript;`/llmdoc:update --reflection` 才消费候选。
