# OfferLoom

[English README](./README.en.md)

OfferLoom 是一个把“主线学习文档 + 面经题库 + 个人工作材料”织成同一条学习链路的面试准备工作台。

它的核心思路不是把题库平铺出来，而是：

- 把完整指南当成主线文档站，按学习顺序连续阅读
- 把面经题目折成每节底部的注脚，同时在命中的知识点上做高亮
- 把 `mywork` 中真实存在的项目、论文、代码、笔记收进答案生成流程里，但只在真的相关时才引用

对 GitHub 用户来说，OfferLoom 的目标很直接：

- 开箱就能跑：仓库内已经内置公开示例文档与题库
- 第一次启动后，可以直接在前端完成可视化配置
- 你只需要额外准备 `codex` / `codex-cli` 和自己的 `mywork` 目录

## 这和普通题库站有什么不同

OfferLoom 会把一个知识点拆成三层：

1. 主线知识
   指南正文是第一视角，保证学习顺序不乱。
2. 面经反引
   题目不是孤立列表，而是贴在知识点上，并标记“是否真的出现在主线里”。
3. 个性化回答
   回答会优先引用主线知识；只有在 `mywork` 真的有证据时，才会往项目经历上靠。

这意味着它不会强迫你“每道题都硬贴项目”。如果题目很基础，或者你的项目确实不沾边，系统会老实告诉你：这题应该按知识理解来答，而不是强行编一个项目桥接。

## 核心匹配范式

发布版默认采用的是“高召回 + 高精度裁剪”的范式：

- 主线文档先做分层检索
  先找具体知识锚点，再找整章级别的候选。
- 精确命中和章节兜底分开
  只有高相关题目才会挂到具体段落；不够精确但明显属于本章大意的题，会统一放到章节末尾的“章节延伸题”。
- `mywork` 做诚实分级
  `direct`: 直接证据，真的能支撑这道题。
  `adjacent`: 只有相邻经验，只能贴边说。
  `none`: 没有可用项目证据，不硬贴。
- 个性化回答遵循“先答题，再决定要不要贴项目”
  简单题和纯基础题，允许完全不结合项目。

这套设计是刻意对齐主流 RAG / hybrid retrieval 系统的做法：

- 先做 lexical + semantic 的混合召回
- 再做 precision gate / rerank，避免把弱相关结果伪装成精确命中
- 对高层主题相关但不够精确的结果单独留一个 fallback bucket，而不是强塞到具体 chunk

技术细节见 [docs/TECHNICAL_REPORT.md](./docs/TECHNICAL_REPORT.md)。

## 技术报告速览

如果你是从 GitHub 搜到这个项目，下面这些关键词基本就是 OfferLoom 的技术骨架：

- hybrid retrieval
- precision gate
- chapter fallback bucket
- interview question backlinking
- personalized interview answer generation
- `mywork` evidence grading
- visual onboarding
- one-command local deploy

对应说明集中写在 [docs/TECHNICAL_REPORT.md](./docs/TECHNICAL_REPORT.md)。
README 负责上手，技术报告负责说明为什么这样设计。

## 仓库内置的公开示例来源

为了让仓库可以直接发布到 GitHub 并开箱即用，下面这些公开资料已经内置在仓库里：

- `sources/documents/llm-agent-interview-guide`
- `sources/question-banks/llm-interview-questions`
- `sources/question-banks/qa-hub`

对应的公开上游仓库见 [docs/SOURCES.md](./docs/SOURCES.md)。

你的私有部分只需要放到：

- `./mywork/`

`mywork/` 默认不会被提交到 GitHub。

## 首次使用前需要准备什么

请先确认两件事：

1. 机器上已经安装并可执行 `codex` / `codex-cli`
2. 你已经有自己的项目材料目录

推荐的 `mywork` 内容包括：

- 项目 README
- 论文 PDF / 草稿
- 代码目录
- notebook
- 实验记录
- 技术方案文档
- 调试复盘

更多规范见 [docs/MYWORK.md](./docs/MYWORK.md)。

## 一键启动

```bash
npm install
npm run setup:serve
```

默认会：

1. 检查 `codex` 是否可用
2. 同步配置里声明的 Git 来源
3. 构建 SQLite 索引
4. 构建前端和后端
5. 在 `6324` 端口启动服务

启动后访问：

- `http://127.0.0.1:6324`
- 或脚本打印出的局域网地址

## 手动启动

如果你想分步骤控制：

```bash
npm install
npm run bootstrap
npm run build:data
npm run build
npm start
```

## 第一次进入前端后怎么配置

OfferLoom 的发布版不仅支持命令行启动，也支持第一次打开站点后在前端完成可视化配置。

推荐流程：

1. 直接运行 `npm run setup:serve`
2. 打开站点
3. 在右上角设置页确认默认公开源
4. 把 `mywork` 指向你自己的目录，或继续使用仓库根目录下的 `./mywork`
5. 在设置页里启动索引任务，并观察图形化进度
6. 索引完成后，从主线文档开始学习，或切到面经 tab 直接刷题

第一次配置完成后，右上角的设置页和任务中心会成为常用入口：

- 设置页负责来源绑定、主题样式、字号与索引入口
- 任务中心负责观察正在生成的答案 / 索引任务 / agent 运行状态

如果你不想用默认来源，也可以在设置页里改成：

- 本地目录
- Git 仓库

## sources 自动发现

系统会自动识别：

```text
sources/
├── documents/
│   └── <your-guide-source>/
└── question-banks/
    └── <your-question-bank-source>/
```

也就是说，发布给 GitHub 用户后，别人只要把新的文档或题库目录放进这两个位置，再到前端设置页保存并重建索引，就能把新来源纳入系统。

除了自动发现，前端设置页也支持手动添加：

- 本地目录
- Git 仓库

## `mywork` 的保守扫描策略

OfferLoom 对 `mywork` 不是“见到文件就全吃”，而是保守扫描：

- 先判断这个目录像不像真实项目
- 格式不匹配或明显空骨架时尽早止损
- 只有能构成项目画像的目录才会递归深入
- 和当前问题几乎不相干的项目会被降权，避免乱贴

这也是为什么生成答案时会区分：

- `direct`
- `adjacent`
- `none`

系统宁可少贴，也不希望生成看起来很像、实际上并不真实的项目回答。

## 站内体验

- 左侧是紧凑树状侧边栏，支持 `主线 / 面经 / 工作` 切换
- 主区以主线文档连续展开，保证学习顺序自然
- 每篇主线文档底部会沉淀相关面试题；高相关但未精确命中的题会进入章末“章节延伸题”
- 面经 tab 会明确标注：
  - 这道题是否出现在主线里
  - 出现频次
  - 是否只是章节级兜底
  - 对应的反引入口
- 点击知识命中会打开知识浮窗，显示：
  - 相关题目
  - 个性化答案
  - 引用回溯
  - `mywork` 证据质量
- 右下角是受管 Codex 浮窗
  - 可自动引用当前文档
  - 可搜索并插入额外文件
  - 支持切换模型与 reasoning effort
- 顶部 `+` 按钮支持导入新面经
  - 粘贴文本
  - 截图 OCR
  - 持久化入库

## 主要脚本

- `npm run bootstrap`
  同步配置中声明为 Git 的公开来源
- `npm run build:data`
  构建 SQLite 索引
- `npm run refresh:data`
  刷新来源并重建索引
- `npm run batch:translate-questions`
  批量翻译题目
- `npm run batch:generate`
  批量生成个性化答案
- `npm run batch:codex`
  通过 Codex 执行批处理任务
- `npm run build`
  构建前端与后端
- `npm run start`
  启动生产服务
- `npm run setup:serve`
  一键安装、建索引、构建并启动
- `npm run clean:data`
  清理数据库、生成答案、缓存与中间产物

## 发布到 GitHub 前后的边界

这个仓库设计成“公开底座 + 私有工作集”的结构：

- 仓库内保留公开示例文档与题库
- `mywork/` 默认不进 Git
- `config/*.runtime.json` 默认不进 Git
- 数据库、生成答案、模型缓存都不建议提交

发布前建议至少阅读：

- [docs/RELEASE.md](./docs/RELEASE.md)
- [docs/PRIVACY.md](./docs/PRIVACY.md)
- [docs/CONFIGURATION.md](./docs/CONFIGURATION.md)
- [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)

## 文档索引

- [docs/TECHNICAL_REPORT.md](./docs/TECHNICAL_REPORT.md)
  检索、匹配、RAG 设计、生成策略与 UI 结构说明
- [docs/TECHNICAL_REPORT.en.md](./docs/TECHNICAL_REPORT.en.md)
  English technical report for GitHub readers
- [docs/SOURCES.md](./docs/SOURCES.md)
  仓库内置公开示例源及其上游地址
- [docs/SOURCES.en.md](./docs/SOURCES.en.md)
  English source list and attribution notes
- [docs/MYWORK.md](./docs/MYWORK.md)
  `mywork` 目录组织建议
- [docs/MYWORK.en.md](./docs/MYWORK.en.md)
  English guide for organizing `mywork`
- [docs/CONFIGURATION.md](./docs/CONFIGURATION.md)
  来源配置与运行时覆盖
- [docs/CONFIGURATION.en.md](./docs/CONFIGURATION.en.md)
  English configuration guide
- [docs/RELEASE.md](./docs/RELEASE.md)
  发布检查单
- [docs/RELEASE.en.md](./docs/RELEASE.en.md)
  English release checklist
- [docs/PRIVACY.md](./docs/PRIVACY.md)
  隐私边界
- [docs/PRIVACY.en.md](./docs/PRIVACY.en.md)
  English privacy and data-handling notes
- [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)
  常见问题排查
- [docs/TROUBLESHOOTING.en.md](./docs/TROUBLESHOOTING.en.md)
  English troubleshooting notes
- [docs/CLI_AGENT.md](./docs/CLI_AGENT.md)
  Embedded CLI agent runtime notes
- [docs/CLI_AGENT.en.md](./docs/CLI_AGENT.en.md)
  English embedded CLI agent notes
