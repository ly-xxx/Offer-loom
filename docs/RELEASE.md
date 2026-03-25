# Release Guide

这是 OfferLoom 发布到 GitHub 前的检查单。

## 必须保留的公开内容

- `sources/documents/*`
- `sources/question-banks/*`
- `sources/README.md`
- `mywork/README.md`
- `config/sources.json`
- 文档站、后端、脚本和公开配置说明
- 默认示例来源的上游引用说明，见 [docs/SOURCES.md](./SOURCES.md)

## 绝对不要提交的内容

- `mywork/` 下你的真实项目材料
- `config/*.runtime.json`
- `data/offerloom.db*`
- `data/generated/*` 里的生成答案
- `data/models/*`
- `data/sources/*` 里的临时镜像
- 任何从私有目录复制进来的文档

## 发布前流程

1. 运行 `npm run clean:data`
2. 确认 `config/sources.json` 指向仓库内 `sources/` 和 `./mywork`
3. 确认 `mywork/` 只有占位 README，没有真实材料
4. 运行 `npm run build:data`
5. 运行 `npm run build`
6. 本地打开 `6324` 做一次完整 smoke test
7. README 和发布页里保留示例来源的 GitHub 链接

## Smoke Test

- `curl --noproxy '*' http://127.0.0.1:6324/api/health`
- 首次使用弹窗要明确提到 `codex` / `codex-cli` 和 `mywork`
- 设置页能看到自动发现的 `sources/documents` 与 `sources/question-banks`
- 左侧侧边栏能切换 `文档` / `我的工作`
- 文档章节与底部注脚正常
- 知识点浮窗能正常打开
- Codex 浮窗可发送请求、停止任务、切换模型和 effort

## 截图与演示

- 只使用仓库内公开资料
- 不要展示真实 `mywork`
- 不要展示本地运行时配置或绝对路径
- 如果演示默认公开数据，建议同时在文案里注明它们来自：
  - `Lau-Jonathan/LLM-Agent-Interview-Guide`
  - `llmgenai/LLMInterviewQuestions`
  - `KalyanKS-NLP/LLM-Interview-Questions-and-Answers-Hub`
