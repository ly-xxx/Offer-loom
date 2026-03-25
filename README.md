# OfferLoom

[English README](./README.en.md)

OfferLoom 是一个本地优先的面试准备工作台，用统一的索引、检索与生成链路处理三类输入：

- 主线学习文档
- 面经题库
- 个人工作材料，例如论文、代码、设计文档、实验记录与笔记

它的设计重点有两点：

- 保留学习顺序。系统以文档主线为中心组织内容，而不是把题目摊平成一个孤立列表。
- 保持证据约束。个性化答案会优先引用主线文档内容，只有在 `mywork` 中存在足够相关的材料时才会引入项目经验。

OfferLoom 不限定领域。对于任意岗位或方向，只需提供相应的学习资料、面经题库以及候选人的工作材料，就可以用同一套流程构建文档站、面经反引与个性化回答。

## 主要能力

- 文档主线阅读
  以学习文档为主体，按原始顺序组织章节与知识点。
- 面经反引
  将题目挂到相关知识点与章节底部，并区分精确命中与章节级补充。
- 个性化回答
  结合主线文档、题目上下文与 `mywork` 证据生成回答；当项目不相关时，系统会保持知识型回答，不伪造项目背书。
- `mywork` 保守扫描
  先判断目录是否构成有效项目，再决定是否递归深入和纳入索引。
- 站内 Codex 协作
  提供受管的浮窗式 Codex 控制台，可自动引用当前文档、附加文件，并支持真实 PTY 终端模式。
- 可视化初始化
  支持在前端完成首次来源配置、索引构建和任务观察。
- 面经导入
  支持粘贴文本与截图 OCR，将新增面经持久化保存为题库来源。

## 仓库内置的公开示例来源

仓库已经包含一组公开示例资料，便于克隆后直接启动：

- `sources/documents/llm-agent-interview-guide`
- `sources/question-banks/llm-interview-questions`
- `sources/question-banks/qa-hub`

这些示例源及其上游地址见 [docs/SOURCES.md](./docs/SOURCES.md)。

私有工作材料默认放在：

- `./mywork/`

`mywork/` 默认不会被提交到 GitHub。

## 运行前准备

开始之前请确认：

1. 当前机器已经安装并可执行 `codex` 或 `codex-cli`
2. 已准备好自己的工作材料目录

推荐放入 `mywork/` 的内容包括：

- 项目 README
- 论文 PDF 或草稿
- 代码目录
- notebook
- 实验记录
- 技术方案文档
- 调试与复盘笔记

更多组织建议见 [docs/MYWORK.md](./docs/MYWORK.md)。

## 快速启动

```bash
npm install
npm run setup:serve
```

默认流程会：

1. 检查 `codex` 是否可用
2. 同步配置中声明的 Git 来源
3. 构建 SQLite 索引
4. 构建前端与后端
5. 在 `6324` 端口启动服务

启动后访问：

- `http://127.0.0.1:6324`
- 或脚本打印出的局域网地址

## 分步启动

如果希望手动控制每一步：

```bash
npm install
npm run bootstrap
npm run build:data
npm run build
npm start
```

## 第一次打开站点后的配置流程

推荐按下面的顺序完成首次配置：

1. 运行 `npm run setup:serve`
2. 打开站点
3. 在设置页检查默认公开源
4. 将 `mywork` 指向自己的工作材料目录，或继续使用仓库根目录下的 `./mywork`
5. 在设置页启动索引任务，并在任务中心查看实时进度
6. 索引完成后，从主线文档或面经视图开始使用

设置页主要负责：

- 来源绑定
- 主题样式与字号
- 索引构建入口

任务中心主要负责：

- 索引任务状态
- 个性化答案生成状态
- 受管 Codex 作业状态

如果不想使用默认来源，也可以在设置页中改成：

- 本地目录
- Git 仓库

## sources 自动发现

系统会自动识别如下结构：

```text
sources/
├── documents/
│   └── <your-guide-source>/
└── question-banks/
    └── <your-question-bank-source>/
```

这意味着新增公开资料时，通常只需要把新目录放入对应位置，再在前端保存配置并重建索引即可。

除了自动发现，设置页也支持手动注册：

- 本地目录
- Git 仓库

## `mywork` 的处理原则

OfferLoom 对 `mywork` 采用保守扫描策略：

- 先识别目录是否形成有效项目
- 对明显空骨架或格式不匹配的目录尽早停止深入
- 仅在能够形成项目画像时才继续递归和切分
- 对与当前问题关联度过低的项目降低权重，而不是强行匹配

因此，系统会把工作证据分为三类：

- `direct`
- `adjacent`
- `none`

这套分级的目标是保持回答诚实可回溯，而不是尽量把每一道题都包装成项目题。

## 技术说明

实现细节集中写在 [docs/TECHNICAL_REPORT.md](./docs/TECHNICAL_REPORT.md)，主要覆盖以下内容：

- 系统架构与组件职责
- 受管 agent 与辅助 worker
- skills 设计与当前接线情况
- OfferLoom 与 `codex-cli` 的协作方式
- 数据流、索引流程与持久化结构
- 前端消费的数据模型与界面分工

README 主要用于快速上手；技术报告用于说明实现边界、数据结构与工程取舍。

## 常用脚本

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

## 发布与隐私边界

仓库默认采用“公开底座 + 私有工作集”的发布结构：

- 仓库内保留公开示例文档与题库
- `mywork/` 默认不提交
- `config/*.runtime.json` 默认不提交
- 数据库、生成答案和模型缓存不建议提交

发布前建议至少阅读：

- [docs/RELEASE.md](./docs/RELEASE.md)
- [docs/PRIVACY.md](./docs/PRIVACY.md)
- [docs/CONFIGURATION.md](./docs/CONFIGURATION.md)
- [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)

## 文档索引

- [docs/TECHNICAL_REPORT.md](./docs/TECHNICAL_REPORT.md)
  系统架构、agent、skill、数据流与数据结构说明
- [docs/TECHNICAL_REPORT.en.md](./docs/TECHNICAL_REPORT.en.md)
  English system report
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
  English privacy notes
- [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)
  常见问题排查
- [docs/TROUBLESHOOTING.en.md](./docs/TROUBLESHOOTING.en.md)
  English troubleshooting notes
- [docs/CLI_AGENT.md](./docs/CLI_AGENT.md)
  内嵌 CLI agent 运行说明
- [docs/CLI_AGENT.en.md](./docs/CLI_AGENT.en.md)
  English embedded CLI agent notes
