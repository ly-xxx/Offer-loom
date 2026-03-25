# OfferLoom 技术报告

[English Version](./TECHNICAL_REPORT.en.md)

## 1. 概述

OfferLoom 是一个本地优先的面试准备系统，统一处理三类输入：

- 主线学习文档
- 面经题库
- 用户提供的工作材料，例如论文、代码、设计文档、实验记录和笔记

系统的实现目标是：

- 保留学习顺序，使文档站能够作为主阅读界面
- 建立题目到知识点、题目到项目材料的可回溯链接
- 在具备足够证据时生成个性化回答，在证据不足时保持知识型回答
- 在公开发布场景中明确区分公开数据与私有 `mywork`

当前版本采用单机部署架构，由 Web 前端、Express/WebSocket 服务端、SQLite 数据库以及本机 `codex-cli` 执行层组成。

## 2. 设计范围与非目标

### 2.1 设计范围

OfferLoom 当前版本覆盖以下能力：

- 来源发现、同步与索引构建
- 文档主线展示与题目反引
- `mywork` 项目扫描、摘要整理与相关性分级
- 面经翻译、答案生成与结果持久化
- 站内受管 Codex 控制台与交互式 PTY 终端
- 首次使用时的可视化配置、任务中心与实时刷新

### 2.2 非目标

当前实现不以以下方向为目标：

- 通用型多智能体编排平台
- 云端多租户服务
- 依赖外部向量数据库的重型在线检索系统

系统内部确实存在多个受管 agent 角色，但它们承担的是产品级作业执行职责，而不是内部自组织的 planner/executor/critic 式多智能体框架。

## 3. 总体架构

整体架构可分为五层：

```text
┌─────────────────────────────────────────────────────────────┐
│ Web UI                                                     │
│ 文档 / 面经 / My Work / 设置 / 任务中心 / Codex 浮窗       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ HTTP + WebSocket Service                                   │
│ /api/* /ws/codex /ws/watch                                 │
│ Express + ws + job managers                                │
└─────────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼────────────────┬──────────────────┐
          ▼               ▼                ▼                  ▼
┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ Index Agent    │ │ Answer Agent   │ │ Console Agent  │ │ PTY Runtime    │
│ build-db       │ │ answer package │ │ managed codex  │ │ interactive CLI│
└────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘
          │               │                │                  │
          ▼               ▼                ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│ SQLite + Generated Files + Runtime Config                  │
│ documents / sections / questions / links / work / answers  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Sources + mywork + manual imports + codex-cli              │
│ 本地目录 / Git 仓库 / OCR 导入 / 工作材料 / Codex 执行       │
└─────────────────────────────────────────────────────────────┘
```

这五层分别负责：

- Web UI：文档阅读、题目查看、任务管理与 Codex 交互
- HTTP/WebSocket Service：统一 API、作业管理和实时事件分发
- Agent/Runtime Layer：索引、答案生成、控制台与 PTY 执行
- Persistence Layer：SQLite、生成结果文件和运行时配置
- Source Layer：公开来源、`mywork`、手工导入内容以及本机 Codex

## 4. 执行组件与受管 Agent

### 4.1 Index Agent

实现位置：

- `server/lib/indexer.ts`
- 对外入口：`POST /api/index/jobs`

职责：

- 保存运行时来源配置
- 同步 Git 来源或读取本地来源
- 调用 `scripts/build-db.mjs` 重建索引
- 先构建临时数据库，再切换到正式数据库
- 向前端持续汇报阶段、日志和进度

索引任务采用热切换策略：构建过程写入 `tempDbPath`，仅在构建成功后替换线上数据库，以避免前端读到中间态数据。

主要阶段状态包括：

- `writing_config`
- `syncing_sources`
- `building_index`
- `swapping_database`
- `ready`

### 4.2 Answer Agent

实现位置：

- `server/lib/codex.ts`
- 类：`AnswerJobManager`
- 对外入口：`POST /api/generated`

职责：

- 读取题目详情与关联上下文
- 收集主线文档锚点
- 收集 `mywork` 的 `direct`/`adjacent` 证据
- 合并用户显式选中的文档引用
- 加载 skills 形成最终 prompt
- 调用 `codex exec`
- 按 JSON Schema 约束输出
- 将结果写回数据库和 `data/generated/`

该组件面向稳定的结构化答案生成，而非开放式聊天。输出由 `schemas/answer-package.schema.json` 约束，核心字段包括：

- `elevator_pitch`
- `full_answer_markdown`
- `work_story`
- `work_evidence_status`
- `work_evidence_note`
- `knowledge_map`
- `citations`
- `follow_ups`
- `missing_basics`

前端据此将一份结果拆解为开场回答、完整答案、项目切入、知识骨架、引用回溯与后续追问。

### 4.3 Managed Codex Console Agent

实现位置：

- `server/lib/codex.ts`
- 类：`ManagedCodexConsoleManager`
- 对外入口：`POST /api/codex-console/jobs`

职责：

- 接收浮窗中的自然语言消息
- 拼接最近对话历史
- 自动附加当前打开文档
- 追加用户手选文件与项目摘要
- 调用 `codex exec`
- 按 `schemas/codex-console.schema.json` 输出结构化回复

该组件服务于站内协作式交互，适合：

- 解释当前文档
- 基于当前章节补充回答
- 审阅指定文件
- 直接修改选中文件
- 返回带引用、改动摘要和告警的聊天式结果

输出字段包括：

- `mode`
- `headline`
- `summary`
- `reply_markdown`
- `warnings`
- `changed_files`
- `citations`
- `follow_ups`

### 4.4 交互式 PTY Codex Runtime

实现位置：

- `server/lib/codex.ts` 中的 `attachCodexPty`
- `scripts/codex_pty_bridge.py`
- WebSocket：`/ws/codex`

该组件提供真实终端语义，而不是 schema 约束的批处理调用。其执行流程为：

1. 浏览器通过 WebSocket 发送 `start`、`input` 与 `resize`
2. 服务端启动 Python PTY bridge
3. bridge 启动真实的本机 `codex` 进程
4. 标准输出与错误输出回传到浏览器
5. 前端以浮窗形式呈现可拖动、可折叠、可 resize 的终端

该路径保留了 `codex-cli` 的原生交互能力，同时由 OfferLoom 提供模型选择、文档引用、文件注入和实时刷新等附加能力。

### 4.5 辅助 Worker

除上述四个核心组件外，当前实现还包含两个重要的辅助 worker：

1. 面经导入 worker
   前端 `InterviewImportModal` 支持粘贴文本或截图 OCR；截图路径通过 `tesseract.js` 在浏览器侧识别文本，再通过 `POST /api/questions/import` 写成新的 Markdown 题库来源。
2. 文件监听 worker
   `server/index.ts` 通过 `/ws/watch` 建立文件监听；当前文档被 Codex 修改后，前端会收到 `changed` 事件并刷新状态。

## 5. Skill 层设计

当前仓库中共有 6 个 skill 文件，位于 `skills/` 目录：

- `answer-composer.md`
- `mywork-triage.md`
- `project-interviewer.md`
- `codex-console.md`
- `question-linker.md`
- `work-summarizer.md`

### 5.1 运行时直接加载的 Skills

以下 skill 已进入主链路：

- `answer-composer.md`
  规定个性化答案包的结构、质量要求和输出风格
- `mywork-triage.md`
  约束 `mywork` 相关性判断，强调“格式不匹配或无关时及时止损”
- `project-interviewer.md`
  以面试官视角审视项目材料，提取可讲贡献、薄弱点与追问方向
- `codex-console.md`
  规范受管控制台的回答形式、引用方式和改动摘要结构

上述 skill 当前由以下代码路径直接加载：

- `server/lib/codex.ts`
- `scripts/batch-generate.mjs`

### 5.2 已编写但未自动串联的 Skills

以下 skill 已存在，但尚未作为独立 LLM 阶段串入主流程：

- `question-linker.md`
  面向“题目到主线章节锚点”的精细链接；当前主链接逻辑仍在 `scripts/build-db.mjs` 的启发式/hybrid 打分中
- `work-summarizer.md`
  面向单项目摘要；当前项目摘要主要由 `server/lib/projectPrep.ts` 的规则抽取完成

### 5.3 Skill 的架构定位

在当前版本中，skill 更适合作为任务约束模板层来理解，而不是动态插件系统。它们的作用主要是：

- 固定不同作业的输出结构
- 降低 prompt 漂移
- 让 Answer Agent、Console Agent 和批处理脚本共享一致的任务约束

## 6. 与 `codex-cli` 的协作模式

OfferLoom 与 `codex-cli` 的集成分为三条链路。

### 6.1 Schema-Constrained Batch

适用场景：

- 题目翻译
- 个性化答案生成
- 受管控制台的结构化回复

典型调用形式：

```text
codex exec
  --skip-git-repo-check
  --cd <ROOT_DIR>
  --output-schema <schema.json>
  --output-last-message <outputFile>
  -m <model>
  -c model_reasoning_effort="<effort>"
  -
```

这一模式的特点是：

- prompt 通过标准输入传递
- 输出受 schema 约束
- 服务端只消费最后一条结构化消息
- 结果便于持久化和前端稳定渲染

### 6.2 Managed Console

该模式建立在 `codex exec` 之上，但由 OfferLoom 负责上下文治理。除了用户当前消息之外，系统还会注入：

- 最近对话历史
- 当前打开文档
- 用户显式选中的文件
- 用户显式选中的项目摘要
- `codex-console.md` 定义的回答契约

因此，该模式的职责分工是：

- `codex-cli` 负责推理和文件操作
- OfferLoom 负责上下文拼装、任务治理和结果结构化

### 6.3 PTY Interactive Runtime

该模式直接启动真实 CLI，会话命令形态接近：

```text
codex
  --cd <ROOT_DIR>
  --no-alt-screen
  -a never
  -s danger-full-access
  -m <model>
  -c model_reasoning_effort="<effort>"
```

这一模式保留：

- 流式终端输出
- 原生键盘交互
- 动态窗口 resize
- 更长链路的开放探索和修改

### 6.4 三条链路的分工

三条链路分别服务于不同任务：

- Schema-Constrained Batch：稳定、结构化、可持久化
- Managed Console：带上下文治理的文档协作
- PTY Runtime：保留真实终端语义的交互式会话

这种拆分使前端可以同时提供“可批处理的生成能力”和“可实时探索的 CLI 能力”。

## 7. 数据流

### 7.1 首次启动

首次启动的数据流如下：

```text
config/sources.json
   ↓
自动发现 sources/documents/* 与 sources/question-banks/*
   ↓
bootstrap.mjs 同步 Git 来源
   ↓
build-db.mjs 读取 guide / question bank / mywork
   ↓
构建 SQLite、FTS 与 link relations
   ↓
前端经由 /api/meta /api/documents /api/questions 读取
```

### 7.2 索引构建

`scripts/build-db.mjs` 的主流程可概括为六步：

1. 读取来源配置与翻译缓存
2. 解析主线文档、题库和 `mywork`
3. 规范化文档、切分 section、抽取问题、扫描项目、切分 work chunk
4. 可选地构建 embeddings
5. 计算 question 到 guide/work 的 link relations
6. 写入 SQLite、FTS 表和 `app_meta`

构建过程中会产出阶段事件，例如：

- `sources`
- `mywork_scan`
- `embedding_prepare`
- `embedding_run`
- `linking`
- `finalize`
- `done`

Index Agent 会将这些事件转换为前端的进度条与日志。

### 7.3 题目翻译

题目翻译由 `scripts/batch-translate-questions.mjs` 负责，流程如下：

```text
questions
   ↓
按 batch 送入 codex exec
   ↓
按 question-translation schema 取回结果
   ↓
回写 questions.metadata_json.translatedText
   ↓
更新 questions_fts
   ↓
保存 translation cache
```

### 7.4 个性化答案生成

点击“生成个性化答案”时，数据流为：

```text
Question ID
   ↓
db.getQuestion()
   ↓
guideMatches / guideFallbackMatches / workMatches / workHintMatches
   ↓
附加当前文档与用户显式引用
   ↓
加载 answer-composer + mywork-triage + project-interviewer
   ↓
codex exec + answer schema
   ↓
generated_answers 落库
   ↓
data/generated/<questionId>.json 落文件
   ↓
前端轮询任务状态并渲染结果
```

### 7.5 受管 Console

受管控制台的数据流为：

```text
用户消息
   ↓
最近对话历史
   ↓
当前文档 / 选中文件 / 选中项目摘要
   ↓
加载 codex-console skill
   ↓
codex exec + console schema
   ↓
返回结构化聊天结果
   ↓
前端渲染 markdown / changed_files / citations / warnings
```

### 7.6 面经导入与实时刷新

截图导入链路：

```text
用户粘贴截图
   ↓
前端 tesseract.js OCR
   ↓
POST /api/questions/import
   ↓
保存为 sources/question-banks/manual-mianjing/imports/<month>/<file>.md
   ↓
下次重建索引时纳入题库解析
```

文件刷新链路：

```text
Codex 修改文件
   ↓
/ws/watch 检测到文件变化
   ↓
浏览器收到 changed 事件
   ↓
当前打开文档刷新状态
```

## 8. 索引、检索与链接策略

### 8.1 主线文档层

主线文档被拆分为：

- `documents`
- `sections`
- `sections_fts`

`section` 是后续题目链接和知识高亮的主要锚点。

### 8.2 题库层

题库处理流程包括：

- 抽取题目文本
- canonical normalization
- fingerprint 去重
- 类型与难度推断
- 可选翻译
- 写入 `questions` 和 `questions_fts`

### 8.3 `mywork` 层

`mywork` 的处理遵循保守原则：

- 先识别候选项目
- 判断是否值得进入索引
- 文档层写入 `documents`
- 项目层写入 `work_projects`
- chunk 层写入 `work_chunks` 和 `work_chunks_fts`

同时，系统会为项目整理访谈式摘要结构：

- `openingPitch`
- `whyThisProjectMatters`
- `interviewArc`
- `highlightFacts`
- `deepDiveQuestions`

这部分主要由 `server/lib/projectPrep.ts` 生成。

### 8.4 链接关系

当前持久化的核心关系包括：

- `question_to_section`
- `question_to_document_fallback`
- `question_to_work_chunk`
- `question_to_work`
- `question_to_work_hint`

其中：

- `question_to_section` 用于精确知识点挂载
- `question_to_document_fallback` 用于章节级补充题
- `question_to_work` 与 `question_to_work_hint` 用于区分直接证据和相邻证据

### 8.5 精度控制

当前版本采用“精确挂载 + 章节兜底”的两层策略：

- 只有高置信度命中的题目才挂载到具体 `section`
- 与整章主题相关但不足以命中具体段落的题目进入 `question_to_document_fallback`

在 `mywork` 侧，系统把证据分为：

- `direct`
- `adjacent`
- `none`

该设计的目标是尽量减少“弱相关题目被误标为精确知识命中”以及“项目经历被硬贴到基础题”这两类失真。

### 8.6 检索模式

构建阶段会记录：

- `retrieval_mode`
- `embedding_model`
- `embedding_error`
- `work_index_summary`

因此，系统既支持 embeddings 可用时的 hybrid 模式，也支持 embeddings 不可用时的 lexical/heuristic 回退模式。

## 9. 数据模型与 Schema

### 9.1 来源配置

核心配置类型包括：

- `OfferLoomSource`
- `OfferLoomWorkSource`
- `OfferLoomSourcesConfig`

简化后的配置结构如下：

```json
{
  "guides": [
    {
      "id": "llm-agent-interview-guide",
      "type": "local",
      "path": "./sources/documents/llm-agent-interview-guide",
      "kind": "guide"
    }
  ],
  "questionBanks": [
    {
      "id": "qa-hub",
      "type": "local",
      "path": "./sources/question-banks/qa-hub",
      "kind": "question_bank"
    }
  ],
  "myWork": {
    "id": "candidate-workspace",
    "type": "local",
    "path": "./mywork",
    "kind": "work_root",
    "supplementalRoots": [],
    "manifestPath": "./config/work-manifest.json"
  }
}
```

### 9.2 持久化结构

主表包括：

- `app_meta`
- `sources`
- `documents`
- `sections`
- `questions`
- `links`
- `work_projects`
- `generated_answers`
- `work_chunks`

FTS 表包括：

- `sections_fts`
- `questions_fts`
- `work_chunks_fts`

这套结构的语义分层如下：

- `documents`：原始文档层
- `sections`：主线章节锚点层
- `questions`：面试题层
- `links`：题目到主线和工作材料的关系层
- `work_projects`：项目摘要层
- `work_chunks`：项目 chunk 检索层
- `generated_answers`：LLM 结果持久化层

### 9.3 前端核心类型

前端主要围绕以下 TypeScript 类型工作：

- `QuestionDetail`
- `DocumentData`
- `WorkProjectDetail`
- `GeneratedAnswer`
- `AgentJob`

其中：

- `QuestionDetail` 包含题目原文、译文、主线命中、工作证据与生成结果
- `DocumentData` 包含文档元数据、分段内容、命中计数和章节补充题
- `WorkProjectDetail` 包含项目摘要、代表性文档和可讲问题
- `AgentJob` 将答案生成、控制台作业和索引任务纳入同一套任务中心模型

这些类型定义位于 `web/src/types.ts`。

### 9.4 答案包 Schema

个性化答案输出由 `schemas/answer-package.schema.json` 约束。简化结构如下：

```json
{
  "question": "...",
  "elevator_pitch": "...",
  "full_answer_markdown": "...",
  "work_story": "...",
  "work_evidence_status": "direct | adjacent | none",
  "work_evidence_note": "...",
  "knowledge_map": [
    {
      "concept": "...",
      "why_it_matters": "...",
      "confidence": "high | medium | low"
    }
  ],
  "citations": [
    {
      "label": "...",
      "path": "...",
      "kind": "guide | question_bank | work | dynamic"
    }
  ],
  "follow_ups": ["..."],
  "missing_basics": ["..."]
}
```

### 9.5 Console Reply Schema

受管控制台输出由 `schemas/codex-console.schema.json` 约束。简化结构如下：

```json
{
  "mode": "answer | edit | review | plan | mixed",
  "headline": "...",
  "summary": "...",
  "reply_markdown": "...",
  "warnings": ["..."],
  "changed_files": [
    {
      "path": "...",
      "summary": "..."
    }
  ],
  "citations": [
    {
      "label": "...",
      "path": "...",
      "kind": "current_document | selected_file | selected_project | guide | work | dynamic"
    }
  ],
  "follow_ups": ["..."]
}
```

该结构面向对话与文件协作，因此包含 `changed_files`，但不强制要求答案包中的 `knowledge_map` 与 `work_story` 字段。

## 10. 前端如何消费这些数据

前端不是单纯的 Markdown 渲染器，而是把结构化数据组织成三个核心视图：

### 10.1 主线文档视图

以 `DocumentData.sections` 为中心：

- 渲染正文内容
- 高亮 `knowledgeHitCount > 0` 的 section
- 在节底展示 `relatedQuestions`
- 在章末展示 `looseRelatedQuestions`

### 10.2 面经视图

以 `QuestionDetail` 为中心：

- 展示主线精确命中与章节级回引
- 展示工作证据状态
- 展示已生成的答案包
- 提供跳回主线与重新生成的入口

### 10.3 My Work 视图

以 `WorkProjectDetail` 为中心：

- 展示项目 opening pitch
- 展示 why-this-matters 说明
- 展示 interview arc 与 deep-dive questions
- 展示与该项目相关的题目和代表性文档

### 10.4 设置、任务中心与 Codex 浮窗

除三类主视图外，前端还承担：

- 来源配置与首次使用引导
- 索引、答案生成和控制台作业的统一任务展示
- 浮窗式 Codex 控制台与 PTY 终端交互

## 11. 发布与隐私边界

OfferLoom 的发布结构是“公开底座 + 私有工作集”：

- 公开示例来源可以随仓库发布
- `mywork/` 默认不应进入版本控制
- `config/*.runtime.json` 默认不应进入版本控制
- 数据库、生成答案、缓存与模型产物不建议提交

这套边界的目的在于：

- 让仓库具备开箱即用的示例内容
- 让每个使用者在本地接入自己的私有工作材料
- 避免公开仓库混入个人路径、项目代号和私有文档

## 12. 当前实现状态

从代码实现的角度，当前版本已经具备以下能力：

- 本地和 Git 来源的统一配置与发现
- Guide、Question Bank 与 `mywork` 的一次性建库
- section、question 和 work chunk 的分层索引
- 精确命中与章节兜底的题目挂载
- `direct` / `adjacent` / `none` 的工作证据分级
- 题目翻译、个性化答案生成与持久化
- 受管 Codex 控制台
- 交互式 PTY Codex 终端
- 文档修改后的实时 watch 刷新
- 文本与截图的面经导入
- 统一任务中心

## 13. 当前限制与后续工作

当前版本仍存在以下边界：

1. `question-linker.md` 尚未被接成独立的 LLM linker/reranker 阶段，主链接逻辑仍以 `build-db.mjs` 的启发式与可选 embedding 为主。
2. `work-summarizer.md` 尚未进入主流程，项目摘要主要依赖 `projectPrep.ts` 的规则抽取。
3. 题目去重已包含规范化与 fingerprint，但还不是完整的语义聚类系统。
4. `generated_answers` 已具备持久化，但尚未形成更细粒度的 prompt lineage 和版本管理。

后续最自然的升级方向包括：

- 将 `question-linker.md` 接为独立 rerank/link 阶段
- 将 `work-summarizer.md` 接入项目摘要生成链
- 引入更强的语义去重与聚类
- 为答案生成补充版本号、prompt lineage 和回归对比能力
- 进一步细化 Console 到文档跳转、文件改动回显与引用选择的联动
