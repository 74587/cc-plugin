# Claude → Codex parity checklist

Claude Code 根插件是唯一手工维护的准源。Codex 表面由 ACPlugin 转换后，发布前逐项检查：

- [ ] `node scripts/check-codex-surface.mjs` 通过：五个版本表面一致，五个 skill 正文与两个 agent 指令正文未漂移，marketplace 身份和 hooks 调用合法。
- [ ] `.claude-plugin/marketplace.json` 与 `.agents/plugins/marketplace.json` 的 marketplace 名均为 `llmdoc-plugin`，其中的插件名均为 `llmdoc`。
- [ ] Claude 表面只有五个 skills：`llmdoc`（operating）与 `init`、`update`、`prune`、`upgrade` 四个显式工作流（`skills/*/SKILL.md`，不再有 `commands/` 目录）；Codex 有对应 skills。
- [ ] 两个平台暴露 `investigator`、受限 `reflector` 与 `recorder` 三个角色契约；Reflector 只能写 `.llmdoc-tmp/reflections/pending/`。
- [ ] `init/update/prune/upgrade` 的宿主专属 front matter / UI policy 保持正确；五个 skill 和三个 agent 的正文一致性已由脚本机械校验。
- [ ] `upgrade` 在两个平台都保持仅显式调用（Claude 侧 `disable-model-invocation: true`；Codex 侧 `policy.allow_implicit_invocation: false`），未被 operating skill 或 hook 隐式触发。
- [ ] Claude 的 `SessionStart`、`Stop`、`PreCompact` 都通过 npm alias `@tokenroll/llmdoc-hook-runtime@npm:@tokenroll/llmdoc` 调用 scoped CLI，避免消费仓库的同名本地依赖遮蔽 runtime；Codex 保留仓库根 `hooks/hooks.json`，并按官方信任模型启用。
- [ ] hooks fail-open、永不写 `llmdoc/`；SessionStart 不超过 200 token，Stop/PreCompact 成功时输出合法 JSON；pending 反思候选能在无代码 delta 时触发 update 提醒。
- [ ] 生成目录中没有 V2 `worker`、tracked reflection/memory 树、startup pack、watermark 或旧命令残留；恢复后的 Reflector 不保存 transcript。
- [ ] `.agents/skills/upgrade/agents/openai.yaml` 设置 `policy.allow_implicit_invocation: false`，确保 upgrade 只能显式调用。
- [ ] 按本清单完成抽验，Codex plugin scanner 与完整 CI 均通过。

ACPlugin 只负责格式转换；它不会可靠删除上次生成留下的陈旧文件。转换应在临时副本中运行，再按生成目录做替换式同步。
