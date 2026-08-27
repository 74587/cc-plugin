# llmdoc V3

[English](README.md)

`llmdoc` 是代码仓库的持久化外置上下文：把 AI 不该每次会话都重新恢复的架构、约束和工作知识放进可检索、可验证、可演进的文档层。

## 运行要求

- Node.js 18 或更新版本
- 通过 npx 把 `@tokenroll/llmdoc` 作为项目外部工具运行
- git 作为有效性、delta 与回滚语义的基础

无需向项目添加任何依赖，直接运行：

```bash
npx -y @tokenroll/llmdoc tree
```

如果希望把 CLI 明确下载到本机，请安装到全局环境，而不是加入某个业务项目：

```bash
npm install --global @tokenroll/llmdoc
llmdoc tree
```

这个可选的本机安装方式不会修改业务项目的 `package.json` 或 lockfile。需要固定版本时直接追加版本号，例如 `npm install --global @tokenroll/llmdoc@3.2.0`。

V3 假定 CLI 始终存在。导航、检索、校验、delta 检测、hook 信号和工作流入口都来自 `npx @tokenroll/llmdoc`。

> 一律使用完整 scoped 名调用：`npx @tokenroll/llmdoc <cmd>`，永远不要用裸的 `npx llmdoc`——后者会解析到 npm 上一个无关的第三方包。`npx -y` 会把缺失的 CLI 获取到 npm 缓存，不会修改业务项目的 `package.json` 或 lockfile。需要固定版本时直接写在包名后，例如 `npx -y @tokenroll/llmdoc@3.2.0 tree`；不要把 llmdoc 安装为项目依赖。


## 公开接口

- Claude Code 的 canonical 插件表面位于仓库根：
  - `.claude-plugin/`
  - `skills/` (operating skill + explicit workflow skills)
  - `agents/`
  - `hooks/hooks.json`
- CLI runtime：`npx @tokenroll/llmdoc <command>`
- 显式工作流：
  - `init`
  - `update`
  - `prune`
  - `upgrade`
- 三个角色：
  - `investigator`：把证据调查写入 `.llmdoc-tmp/investigations/`
  - `reflector`：把强信号用户纠正和已验证错误写入 `.llmdoc-tmp/reflections/pending/`
  - `recorder`：唯一允许写入 tracked `llmdoc/` 知识和 `llmdoc/meta.json` 的角色

Claude 是唯一手工维护的准源。Codex 插件表面由它通过 ACPlugin 转换生成。其他平台只需要一份精简 `AGENTS.md` 加 `npx @tokenroll/llmdoc`。

## 知识模型

V3 使用 `.mdx` 文档，内容是纯 Markdown、YAML front matter，以及一个可选的最小增强 `<CodeRef>`。

- 路径就是文档 ID
- `kind` 只存在于 front matter，不体现在目录名里
- tracked 知识树固定为两层：
  - 根级单例文档，例如 `llmdoc/architecture.mdx`
  - 一层 topic 文件夹，例如 `llmdoc/api-client/retry-policy.mdx`
- topic 就是纯目录：没有 `index.mdx` 入口节点，topic 摘要由 `llmdoc tree` 聚合
- 不允许 topic 嵌套
- 根级地图由 `llmdoc tree` 动态生成，V2 那种根 `index.md` 已移除

tracked 有效性记录在 `llmdoc/meta.json`：

- `validatedRevision` 基于 git revision
- dirty worktree 只是附加信号，不是第二套真相系统
- 写入遵循 git-based 协议：修改后校验，失败时通过 git 回退

临时过程记录放在 `.llmdoc-tmp/`，不属于 tracked knowledge。

稳定正文是承载决策的工程记忆，不是实现库存。优先保留决策及理由、边界、不变量、跨模块契约、非显然失败语义和高风险可重复工作流。`delta` 命中只要求复核，不要求改正文；能从源码、schema、help、测试或生成配置快速恢复的事实留在这些 canonical surface。

## CLI 命令表

| 命令 | 作用 |
|---|---|
| `npx @tokenroll/llmdoc tree` | 动态根地图，列出根单例和 topics |
| `npx @tokenroll/llmdoc index [--topic ...] [--kind ...]` | 输出文档发现用的 front matter 投影 |
| `npx @tokenroll/llmdoc show <path...>` | 读取指定文档正文 |
| `npx @tokenroll/llmdoc search <query>` | 在知识层做词法检索 |
| `npx @tokenroll/llmdoc context --files <src...>` | 从源码文件反查推荐阅读文档 |
| `npx @tokenroll/llmdoc status` | 输出当前有效性、baseline、dirty 与 growth 信号 |
| `npx @tokenroll/llmdoc delta` | 从代码变更推导受影响文档闭包 |
| `npx @tokenroll/llmdoc validate` | 校验 schema、结构、关系、链接与 code paths |
| `npx @tokenroll/llmdoc fingerprint --update <path...> \| --all` | 刷新 `llmdoc/meta.json` 中的 validated revisions |
| `npx @tokenroll/llmdoc commit [--verified <path...> \| --all]` | 校验、提交必要正文，并刷新正文变化或 verified-unchanged 文档的 revision |
| `npx @tokenroll/llmdoc new <path> --kind <kind>` | 脚手架生成新的 V3 文档 |
| `npx @tokenroll/llmdoc adopt <path...>` | 无损登记已有文档到 `llmdoc/meta.json`(不改正文) |
| `npx @tokenroll/llmdoc mv <from> <to>` | 移动文档并更新引用 |
| `npx @tokenroll/llmdoc prune --report` | 输出收敛报告但不写文档 |
| `npx @tokenroll/llmdoc upgrade` | 显式的 V2 到 V3 迁移入口 |
| `npx @tokenroll/llmdoc hook session-start` | 给宿主提供启动信号 |
| `npx @tokenroll/llmdoc hook stop` | 给宿主提供停止时提醒信号 |
| `npx @tokenroll/llmdoc hook compact` | 输出 compact 状态 |

## 工作流语义

### `init`

为一个还没有 llmdoc 的仓库创建第一版 V3 知识。

- 当仓库缺少 llmdoc 时，assistant 可以建议执行
- 用户一旦调用，就授权本次初始化范围
- 如果仓库里已有 V2 知识，应改用 `upgrade`

### `update`

对照当前仓库状态做 tracked knowledge 的语义复核与同步。

- assistant 应该在出现可持久化的新知识后建议执行，但必须先得到一次确认
- 确认后，除非 scope 实质性扩张，否则流程可以完整跑完而不重复确认
- `--reflection` 会消费强信号纠正或失败候选，即使代码 delta 为空也会触发更新判断
- CLI 信号只决定最轻且足够的取证路径，不决定正文是否必须变化
- recorder 只改写已经失效或通过稳定知识准入门槛的内容
- 原文仍成立时按 verified unchanged 收尾，不把新证据追加进正文

### `prune`

在 update 之后收敛重复、碎片、膨胀或可快速重建的知识。

- 只允许显式调用
- 命中 growth gate 时可以被建议
- 没有重复候选不等于知识密度合格，仍需语义审查
- 执行前需要一次确认

### `upgrade`

把仓库从 V2 迁移到 V3。

- 只允许显式调用
- 永不主动建议
- 应在独立的 git 迁移步骤中执行，保证整次迁移可整体回滚

## 结果状态

所有显式工作流都只报告以下一个精确结果名：

- `success`
- `no_change`
- `dry_run`
- `incomplete`
- `failed`

## 渐进读取

日常使用以 CLI 为入口：

1. `npx @tokenroll/llmdoc tree`
2. 用 `npx @tokenroll/llmdoc index --topic <t>` 看文档元数据
3. 用 `npx @tokenroll/llmdoc context --files ...` 或 `npx @tokenroll/llmdoc search ...`
4. 仅对真正需要的文档执行 `npx @tokenroll/llmdoc show ...`

V3 不再保留 V2 的 startup pack、根路由文档、`worker`、tracked reflection kind 或 `sync.md` 契约。CLI 本身就是入口；恢复后的 `reflector` 只写临时晋升候选。

## 安装与验证

### Claude Code

仓库内已验证的插件安装入口：

```bash
/plugin marketplace add https://github.com/TokenRollAI/llmdoc
/plugin install llmdoc@llmdoc-plugin
```

### Codex

按[官方插件文档](https://developers.openai.com/plugins/build/plugins)把本仓库添加为 plugin marketplace 源，然后在 Plugins Directory 中安装 `llmdoc`：

```bash
codex plugin marketplace add TokenRollAI/llmdoc
```

marketplace 目录是 `.agents/plugins/marketplace.json`；插件 manifest 是 `.codex-plugin/plugin.json`，skills 位于 `.agents/skills/`，hooks 在默认位置 `hooks/hooks.json`。Codex 打包由 Claude 表面经 ACPlugin 转换生成，请勿手工编辑。

Codex 要求用户在非托管插件 hooks 运行前审查并信任它们；安装后用 `/hooks` 检查。

### 本仓库开发验证

这个仓库常用的本地验证命令：

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run validate:dogfood
npm run check:prompts
```

请从仓库根目录安装依赖，确保本地 `llmdoc` bin 在校验前已建立链接。`validate:dogfood` 用于校验本仓库 dogfood 的 `llmdoc/` 知识面。

## 仓库形态

```text
.
├── .claude-plugin/
├── .codex-plugin/          # 由 Claude 表面转换生成
├── agents/
│   ├── investigator.md
│   ├── reflector.md
│   └── recorder.md
├── cli/
├── hooks/
│   └── hooks.json
├── skills/
│   ├── llmdoc/          # operating skill
│   ├── init/
│   ├── update/
│   ├── prune/
│   └── upgrade/
├── llmdoc/
│   ├── meta.json
│   ├── architecture.mdx
│   └── <topic>/*.mdx
└── .llmdoc-tmp/
    ├── cache/
    ├── investigations/
    ├── reflections/pending/
    └── records/
```

## 其他平台

Claude Code 与 Codex 用户由插件承担这一切（hooks、operating skill、工作流命令）。没有原生插件系统的工具，通过 npx 按需调用 `@tokenroll/llmdoc`，并把下面这份配方贴进项目的 `AGENTS.md` 即可：

```markdown
# llmdoc

本项目使用 llmdoc V3 作为持久化工程上下文。

- 把 `@tokenroll/llmdoc` 当作项目外部工具，以
  `npx -y @tokenroll/llmdoc ...` 调用；绝不将它写入本项目的 `package.json`
  或 lockfile。需要时在 npx 包名中固定版本。
- 第一次发现式检索前，以及每次进入新子系统时，按意图选择入口：概念、
  契约或“X 在哪里”→ `search`；具体源码文件 → `context --files`；范围不明 →
  `tree`；已知 topic/kind → `index`；已定位的文档正文 → `show`。
- 广泛原生探索指递归或跨目录搜索 llmdoc 尚未圈定的工作集；执行前必须重新
  应用上面的路由。
- llmdoc 圈定工作集后，可以用原生工具核对源码、行号、测试、计数、git 状态
  等实时事实。不要把所有检索命令跑成固定序列；上下文足够就停。
- `init` / `update` / `prune` / `upgrade` 是显式工作流：可以建议、须经用户
  确认后执行；永不主动建议 `upgrade`。
- 稳定知识在 `llmdoc/`；不要手工编辑 `llmdoc/meta.json`。`delta` 命中要求复核，
  不要求改正文；正文只保留决策、边界、不变量、契约和非显然失败语义，可重建
  证据留在源码、schema、help、测试或 `.llmdoc-tmp/`。复核后正文未变的文档用
  `commit --verified` 收尾；其他台账变更走 `commit` / `fingerprint` / `new` /
  `adopt` / `mv`。
- 当用户明确纠正、验证证明方案错误、发生重大返工或违反项目指令，且其中
  暴露出可复用经验时，将它视为反思强信号；只在
  `.llmdoc-tmp/reflections/pending/` 保存隐私安全的候选，不保存完整对话。
- pending 反思候选即使没有代码 delta 也会触发 update 判断。获得用户确认后，
  用 `--reflection` 运行 update，验证候选并应用同一稳定知识准入门槛，只把耐久规则
  合并到既有 architecture 或 guide owner。
- 完成改变架构、契约或工作流的任务后，建议执行 update 工作流。
```

## 示例提示词

- “先加载 llmdoc，检查这个仓库，并告诉我应该先读哪些 topic 文档。”
- “在这些架构改动之后执行 llmdoc update 工作流。”
- “把这个仓库从 llmdoc V2 升级到 V3。”
