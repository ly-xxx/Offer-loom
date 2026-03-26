<p align="center">
  <img src="./README_asset/11cadb915ae5ef40c5dd9c950a097dad.png" alt="OfferPotato repo banner" width="100%" />
</p>

# OfferPotato

<p align="center">
  <a href="https://github.com/ly-xxx/Offer-loom/stargazers"><img src="https://img.shields.io/github/stars/ly-xxx/Offer-loom?style=flat-square" alt="GitHub stars" /></a>
  <a href="https://github.com/ly-xxx/Offer-loom/network/members"><img src="https://img.shields.io/github/forks/ly-xxx/Offer-loom?style=flat-square" alt="GitHub forks" /></a>
  <a href="https://github.com/ly-xxx/Offer-loom/issues"><img src="https://img.shields.io/github/issues/ly-xxx/Offer-loom?style=flat-square" alt="GitHub issues" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-16a34a?style=flat-square" alt="MIT license" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/local--first-workspace-0f766e?style=flat-square" alt="local first" />
  <img src="https://img.shields.io/badge/Codex%20CLI-managed-111827?style=flat-square" alt="Codex CLI managed" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.9" />
  <img src="https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/SQLite-indexed-0f80cc?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite indexed" />
  <img src="https://img.shields.io/badge/docs-ZH%20%7C%20EN-2563eb?style=flat-square" alt="Chinese and English docs" />
</p>

<p align="center">
  <a href="./README.en.md">English README</a> ·
  <a href="./docs/TECHNICAL_REPORT.md">技术报告</a> ·
  <a href="./docs/MYWORK.md">mywork 指南</a> ·
  <a href="./docs/TROUBLESHOOTING.md">常见问题</a>
</p>

> 把完整指南读成主线，把面经折成注脚，把你的项目经验写成能开口的答案，再让一个刻薄的面试官继续追问你。

OfferPotato 是一个本地优先的面试准备工作台。

你给它三类输入：

- 主线学习文档
- 面经题库
- 个人工作材料，例如论文、代码、设计文档、实验记录与笔记

它会把这些整理成一个真正能拿来学、拿来练、拿来回答的在线文档站：

- 文档按原始顺序展开，适合从头到尾建立知识主线
- 面经题目会沉淀到每个章节底部，并在对应知识点处高亮
- 每道题都能生成个性化答案，反引回主线知识和 `mywork`
- 你还可以直接打开面试官压力模式，和一个会不断深挖你的“刻薄面试官”对练

如果你也卡在下面这些问题里，这个仓库通常会很对路：

- 资料很多，但完全不知道应该先学哪一章
- 面试官一开口就是“聊聊你的项目”，你不知道怎么把项目讲到知识点上
- 题库刷了不少，但答案像背书，落不到自己的经历里
- 想让 AI 帮你准备面试，但不想自己手搓索引、prompt、批处理和界面

## 30 秒看懂它到底做什么

| 你提供什么 | OfferPotato 会做什么 | 你最后得到什么 |
| --- | --- | --- |
| 主线学习文档 | 按原顺序切章节、抽知识点、建立学习路径 | 一个可以顺着读下去的主线文档站 |
| 面经题库 | 去重、分类、挂到章节底部并关联知识点 | 哪个知识点对应哪些题，一眼看明白 |
| `mywork/` | 递归扫描、相关性评估、保守引用 | 能够“结合自己的项目讲”的答案 |
| Codex | 受管调用、任务化运行、实时刷新 | 批量生成、翻译、导入、继续深挖 |

OfferPotato 不限定领域。LLM、Agent、算法、Infra、机器人、推荐、CV、NLP，甚至其他任何你能提供“学习资料 + 面经 + 个人材料”的方向，都可以套用这套流程。

## 这不是普通刷题站

- 它不是把题库平铺成一个列表，而是把完整指南当成学习主线
- 它不是只做“检索后回答”，而是把文档、题库、项目材料和 Codex 放进同一工作台
- 它不会强行把每道题都包装成“我做过这个”，相关就引用，不相关就诚实地回到知识回答
- 它不是只给你答案，还会继续扮演面试官往下追问

## 你真正会用到的核心功能

- 主线学习文档站
  按原仓库顺序组织文档，适合从第一章一路学到最后一章。
- 面经注脚与知识高亮
  题目会集中出现在章节底部，同时在命中的知识点处高亮显示，点击就能看题目与答案。
- 个性化答案生成
  生成时会优先引用当前文档与题目上下文，再结合 `mywork` 里的直接证据或相邻证据。
- 面试官压力模式
  每道题都可以进入“压力模式”，系统会扮演一个会持续深挖、会追着你问细节的面试官。
- 受管 Codex 浮窗
  你可以在站内直接继续追问、附加文件、自动引用当前文档，并切换模型与 effort。
- 可视化初始化与任务中心
  第一次使用时直接在前端选择来源、构建索引、观察进度，不需要先学一堆命令。
- 面经导入
  支持直接粘贴文本，或上传截图做 OCR 识别，然后持久化成新的题库来源。

## 3 分钟试一下

哪怕你今天还没准备好自己的资料，也可以先直接 `clone` 下来看看默认内置示例，先感受整套界面和工作流。

```bash
git clone https://github.com/ly-xxx/Offer-loom.git
cd Offer-loom
npm install
npm run setup:serve
```

默认流程会：

1. 检查 `codex` / `codex-cli` 是否可用
2. 同步配置中的公开来源
3. 构建 SQLite 索引
4. 构建前后端
5. 在 `6324` 端口启动服务

启动后访问：

- `http://127.0.0.1:6324`
- 或脚本打印出的局域网地址

如果你现在还没有稳定可用的 `codex` / `codex-cli` 调用方式，可以自行搜索 `codex 中转站`。很多人轻量使用时，日成本大约能控制在 1 到 2 元左右。OfferPotato 不绑定任何具体渠道，价格、稳定性和合规性请自行甄别。

## 一打开站点，你会做的第一件事是什么

推荐直接这样体验：

1. 先用内置示例源启动站点，看一遍默认主界面
2. 打开设置页，把 `mywork` 绑定到你自己的项目目录
3. 启动索引任务，等待工作材料被纳入知识库
4. 打开一章主线文档，看看章节底部的相关题目
5. 对任意一道题生成个性化答案
6. 继续点开面试官压力模式，看系统能把你追问到什么深度

这一步做完，你基本就会知道它值不值得长期放在自己的面试准备流程里。

## 为什么会让人有 clone 试试的欲望

- 仓库自带公开示例源，第一次运行不需要你先整理一大堆文件
- 真正难的是“项目怎么讲”和“被追问怎么办”，OfferPotato 恰好解决的是这两件事
- 界面不是纯脚本工具，而是一个能长期使用的学习工作台
- 你今天可以先拿默认数据跑起来，明天再把自己的项目和面经接进去

## 界面预览

### 主工作台总览

![OfferPotato 主工作台总览](./README_asset/292ece0672fc4478abbc501520177393.png)

主线文档、知识高亮、章节题目、`mywork` 引用和 Codex 浮窗都在同一个界面里，不需要来回切工具。

### 全局检索不是一个孤立页面，而是直接把题库、主线和 Codex 放到同一工作台

| 检索结果可以同时命中题库与主线 | 命中后可以直接回到对应文档继续阅读和追问 |
| --- | --- |
| ![OfferPotato 全局检索与工作台总览](./README_asset/c0a06192043379ef07c1287910a9da7b.png) | ![OfferPotato 搜索结果与主线文档联动](./README_asset/acc379d1da56130e7709d2d8062c382b.png) |

### 受管 Codex 浮窗可以直接改当前主线文档，而且改动会实时反映到正文

| 修改前 | agent 修改中 | 修改完成 |
| --- | --- | --- |
| ![修改前的主线文档与 Codex 浮窗](./README_asset/3c06dd4d2b1e1d46857a3faf832f6cfc.png) | ![Codex 正在修改当前文档](./README_asset/b635d9f7e98f3f39834d703fb1b0dcb8.png) | ![Codex 修改完成后文档实时刷新](./README_asset/8d9928318bf6a07a586fbda7e992eebd.png) |

这不是把终端塞进网页而已，而是把“当前打开的主线文档 + 文件引用 + 指令输入 + 结果回写”连成了一条顺畅的工作流。

### 个性化答案不是一句话，而是一整套能拿去开口的回答包

![个性化答案总览](./README_asset/4230928b02ccc7c565f42fc180b560bf.png)

| 20 秒开场、项目依据与直接回答 | 知识骨架、需要补的基础点与生成记录 | 下一轮高频追问、引用回溯与面试官入口 |
| --- | --- | --- |
| ![个性化答案开头与项目依据](./README_asset/3a47b88c2f9cc1e2a837629fad34c8a7.png) | ![个性化答案中的知识骨架与生成记录](./README_asset/bd635698aad341192467beb2c8b03546.png) | ![个性化答案中的下一轮追问与引用回溯](./README_asset/b355d4d9c8d5ece9dc92db2405dcccc7.png) |

系统不会只给你一个“标准答案”，而是把证据、可讲的项目切入、知识回引、后续追问和生成历史一起收进同一份答案视图。

### 面试官压力模式会继续深挖，逼你把答案讲到真正能扛追问的程度

| 第一轮：你答不上来时，先逼你把思路说出来 | 第二轮：你回答之后，继续往下追问 |
| --- | --- |
| ![面试官压力模式第一轮追问](./README_asset/2944eaeb537423af27f22fba3e300831.png) | ![面试官压力模式第二轮回答后的继续追问](./README_asset/876b3f94973160d69c746c5e1b92d6b3.png) |

如果你以为“生成答案”就结束了，这个模式会很快把你拉回真实面试现场。第一轮会在你说“我不知道”时逼你把最基本的判断路径讲出来；第二轮则会在你已经回答之后继续卡细节、卡边界和卡优先级。

### 主题和配置也不是附属功能，你可以把工作台调成自己更愿意长期使用的样子

| 雾青 | 石墨 | 砂页 |
| --- | --- | --- |
| ![OfferPotato 雾青主题](./README_asset/theme/40c6de9cc9168d0321e20da5e4293fb0.png) | ![OfferPotato 石墨主题](./README_asset/theme/51b64c9c60d7b271429cf4921a4ed835.png) | ![OfferPotato 砂页主题](./README_asset/theme/93043bb97a58b8615fec834e099e1e55.png) |

## 仓库内置的公开示例来源

仓库已经包含一组公开示例资料，方便你 clone 之后直接启动：

- `sources/documents/llm-agent-interview-guide`
- `sources/question-banks/llm-interview-questions`
- `sources/question-banks/qa-hub`

这些示例源及其上游地址见 [docs/SOURCES.md](./docs/SOURCES.md)。

如果你要导入自己的资料，推荐使用：

- `sources/documents/` 放主线文档
- `sources/question-banks/` 放面经题库
- `./mywork/` 放自己的项目、论文、代码和笔记

`mywork/` 默认不会被提交到 GitHub。

## `mywork` 放什么最有价值

推荐放入 `mywork/` 的内容包括：

- 项目 README
- 论文 PDF 或草稿
- 代码目录
- notebook
- 实验记录
- 技术方案文档
- 调试与复盘笔记

更多组织建议见 [docs/MYWORK.md](./docs/MYWORK.md)。

OfferPotato 对 `mywork` 采用保守扫描策略：

- 先识别目录是否形成有效项目
- 对明显空骨架或格式不匹配的目录尽早停止深入
- 仅在能够形成项目画像时才继续递归和切分
- 对与当前问题关联度过低的项目降低权重，而不是强行匹配

因此，系统会把工作证据分为三类：

- `direct`
- `adjacent`
- `none`

目标不是“每道题都硬贴项目”，而是“相关时讲得漂亮，不相关时也讲得诚实”。

## 第一次打开站点后的配置流程

推荐按下面的顺序完成首次配置：

1. 运行 `npm run setup:serve`
2. 打开站点
3. 在设置页检查默认公开源
4. 将 `mywork` 指向自己的工作材料目录，或继续使用仓库根目录下的 `./mywork`
5. 在设置页启动索引任务，并在任务中心查看实时进度
6. 索引完成后，从主线文档或面经视图开始使用

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

## 技术说明

README 负责快速上手；更完整的实现细节在下面这些文档里：

- [docs/TECHNICAL_REPORT.md](./docs/TECHNICAL_REPORT.md)
  系统架构、agent、skills、数据流与数据结构说明
- [docs/MYWORK.md](./docs/MYWORK.md)
  `mywork` 目录组织建议
- [docs/CONFIGURATION.md](./docs/CONFIGURATION.md)
  来源配置与运行时覆盖
- [docs/CLI_AGENT.md](./docs/CLI_AGENT.md)
  内嵌 CLI agent 运行说明
- [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)
  常见问题排查

## 发布与隐私边界

仓库默认采用“公开底座 + 私有工作集”的发布结构：

- 仓库内保留公开示例文档与题库
- `mywork/` 默认不提交
- `config/*.runtime.json` 默认不提交
- 数据库、生成答案和模型缓存不建议提交

发布前建议至少阅读：

- [docs/RELEASE.md](./docs/RELEASE.md)
- [docs/PRIVACY.md](./docs/PRIVACY.md)

## Star History

<a href="https://www.star-history.com/#ly-xxx/Offer-loom&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=ly-xxx/Offer-loom&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=ly-xxx/Offer-loom&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=ly-xxx/Offer-loom&type=Date" />
  </picture>
</a>
