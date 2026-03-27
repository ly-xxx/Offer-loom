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

**如果你正在准备技术面试，大概率会遇到这三个死局：**

1. **“结合你的项目讲讲？”** —— 八股文背得再熟，面试官一问怎么落地到你的项目里，大脑直接空白。
2. **“收藏从未停止，学习从未开始”** —— 存了上百个面经和教程仓库，零散破碎，根本不知道从哪看起，也连不成一条学习主线。
3. **“AI 模拟面试太水”** —— 用通用 AI 辅助，它只会吐出干巴巴的标准答案，根本不会像真实的面试官那样抓着细节连环追问。

**OfferPotato 就是为了打破这个局面而生的。** 它不是另一个平铺直叙的“八股文汇总”仓库，而是一个**面试准备工作台**。你只需要提供三样东西：**学习指南**、**面经题库**、**你的个人材料（代码/论文/笔记）**。它会把这些整合成一个串联的知识域，不仅告诉你这题怎么答，还会翻出你的代码告诉你**“结合你的这个项目，你应该这么聊”**。

## 核心工作流

| 输入 | OfferPotato 的处理 | 输出 |
| --- | --- | --- |
| **主线学习文档** | 切分章节、提取知识点、建立路径 | 可顺畅阅读的主线文档站 |
| **面经题库** | 去重、分类、关联知识点 | 挂载在章节底部并高亮的面经集合 |
| **`mywork/` (个人材料)** | 递归扫描、相关性评估、保守引用 | **结合你真实项目经验**的个性化回答 |
| **Codex** | 受管调用、任务化运行、实时刷新 | 批量生成答案、**压力面试对练**、文档翻译 |

OfferPotato 不绑定特定技术栈。无论你是准备 LLM、前端、后端、算法还是其他方向，只要有“教程 + 面经 + 个人项目”，就可以套用这套工作流。

## 核心特性

- **文档与题库联动**：把完整的学习指南作为阅读主线，相关面经题目会作为“注脚”直接高亮在对应知识点处。
- **结合经验生成答案**：告别套话。AI 会优先读取 `mywork` 中的个人项目代码、实验记录或笔记，为你量身定制回答逻辑。找不到相关经验时，也会诚实地回归知识点本身。
- **压力面试模式**：生成答案只是开始。系统会扮演面试官，针对你的回答继续卡边界、抠细节，进行多轮深度追问。
- **沉浸式 AI 工作台**：内置受管 Codex 浮窗，支持在阅读文档时直接追问、补充文件或修改正文，所见即所得。
- **面经一键导入**：支持直接粘贴文本或截图 OCR 导入新题目，自动结构化入库。

## 快速开始

仓库内置了公开的测试数据，即便你还没整理好自己的资料，也可以直接跑起来体验整套界面和工作流。

```bash
git clone [https://github.com/ly-xxx/Offer-loom.git](https://github.com/ly-xxx/Offer-loom.git)
cd Offer-loom
npm install
npm run setup:serve
```

该脚本会自动完成检查、同步公开源、构建 SQLite 索引及前后端，并在 `6324` 端口启动服务。启动后直接访问：`http://127.0.0.1:6324`。

*(注：请确保本地已配置好可用的 `codex` / `codex-cli`，OfferPotato 本身不提供大模型 API，需自行解决调用渠道)*

### 首次上手建议

1. 使用内置示例源启动站点，熟悉主界面布局。
2. 进入**设置页**，将 `mywork` 路径绑定到你真实的本地项目目录。
3. 启动索引任务，等待你的代码/笔记被纳入知识库。
4. 打开一篇主线文档，查看底部的关联题目。
5. 挑选一题生成个性化答案，并尝试进入“压力面试模式”进行对练。

## 界面预览

### 主工作台
主线文档、知识高亮、章节题目、`mywork` 引用和 Codex 浮窗全部集成在单页面内。

![OfferPotato 主工作台总览](./README_asset/292ece0672fc4478abbc501520177393.png)

### 全局检索与文档联动
检索结果同时命中题库与主线，点击直达原文上下文。

| 命中题库与主线 | 直达对应文档 |
| --- | --- |
| ![OfferPotato 全局检索与工作台总览](./README_asset/c0a06192043379ef07c1287910a9da7b.png) | ![OfferPotato 搜索结果与主线文档联动](./README_asset/acc379d1da56130e7709d2d8062c382b.png) |

### 个性化答案与追问
不只是标准答案，而是包含开场白、项目依据、知识骨架及高频追问的完整回答包。

![个性化答案总览](./README_asset/4230928b02ccc7c565f42fc180b560bf.png)

| 结合项目依据 | 知识骨架与生成记录 | 后续追问与溯源 |
| --- | --- | --- |
| ![个性化答案开头与项目依据](./README_asset/3a47b88c2f9cc1e2a837629fad34c8a7.png) | ![个性化答案中的知识骨架与生成记录](./README_asset/bd635698aad341192467beb2c8b03546.png) | ![个性化答案中的下一轮追问与引用回溯](./README_asset/b355d4d9c8d5ece9dc92db2405dcccc7.png) |

### 压力面试模式
模拟真实面试场景，逼迫你理清思路并应对细节追问。

| 答不上来时，引导说出推导路径 | 回答后，继续深挖细节 |
| --- | --- |
| ![面试官压力模式第一轮追问](./README_asset/2944eaeb537423af27f22fba3e300831.png) | ![面试官压力模式第二轮回答后的继续追问](./README_asset/876b3f94973160d69c746c5e1b92d6b3.png) |

### 主题配置
提供多套主题，适配长期阅读。

| 雾青 | 石墨 | 砂页 |
| --- | --- | --- |
| ![OfferPotato 雾青主题](./README_asset/theme/40c6de9cc9168d0321e20da5e4293fb0.png) | ![OfferPotato 石墨主题](./README_asset/theme/51b64c9c60d7b271429cf4921a4ed835.png) | ![OfferPotato 砂页主题](./README_asset/theme/93043bb97a58b8615fec834e099e1e55.png) |

## 目录结构与数据源

仓库默认包含公开示例，详见 [docs/SOURCES.md](./docs/SOURCES.md)。系统会自动识别以下结构：

```text
sources/
├── documents/           # 存放主线学习文档
│   └── <你的教程目录>/
└── question-banks/      # 存放面经题库
    └── <你的题库目录>/
```

### 关于 `mywork`
建议将你准备用来面试的**项目 README、论文草稿、代码、实验记录或复盘笔记**放入 `./mywork/` 目录中。该目录已被加入 `.gitignore`，不会被提交到远程。OfferPotato 采用保守扫描策略，仅在相关度足够高时才会进行引用关联，避免强行匹配。更多组织建议请参考 [docs/MYWORK.md](./docs/MYWORK.md)。

## 常用命令

- `npm run bootstrap`: 同步配置中声明的 Git 公开源
- `npm run build:data`: 构建 SQLite 索引
- `npm run refresh:data`: 刷新来源并重建索引
- `npm run batch:generate`: 批量生成个性化答案
- `npm run setup:serve`: 一键安装、建索引、构建并启动
- `npm run clean:data`: 清理数据库、缓存与中间产物

## 更多文档

- [docs/TECHNICAL_REPORT.md](./docs/TECHNICAL_REPORT.md)：系统架构、数据流与 Agent 实现细节
- [docs/CONFIGURATION.md](./docs/CONFIGURATION.md)：数据源配置说明
- [docs/CLI_AGENT.md](./docs/CLI_AGENT.md)：内嵌 CLI Agent 使用指南
- [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)：常见问题排查
- [docs/RELEASE.md](./docs/RELEASE.md) & [docs/PRIVACY.md](./docs/PRIVACY.md)：发布规范与隐私边界说明

## Star History

<a href="https://www.star-history.com/#ly-xxx/Offer-loom&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=ly-xxx/Offer-loom&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=ly-xxx/Offer-loom&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=ly-xxx/Offer-loom&type=Date" />
  </picture>
</a>
