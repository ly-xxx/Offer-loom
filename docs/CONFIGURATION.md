# Configuration

OfferLoom 的来源配置分成两层：

- 仓库内默认公开配置
- 本地运行时私有配置

## 默认配置

默认读取：

- `config/sources.json`
- `config/work-manifest.json`

现在默认配置已经改成仓库内公开源：

- `./sources/documents/llm-agent-interview-guide`
- `./sources/question-banks/llm-interview-questions`
- `./sources/question-banks/qa-hub`
- `./mywork`

默认公开源的上游参考仓库：

- `llm-agent-interview-guide`: <https://github.com/Lau-Jonathan/LLM-Agent-Interview-Guide>
- `llm-interview-questions`: <https://github.com/llmgenai/LLMInterviewQuestions>
- `qa-hub`: <https://github.com/KalyanKS-NLP/LLM-Interview-Questions-and-Answers-Hub>

## `sources/` 自动发现

系统会自动扫描：

```text
sources/documents/*
sources/question-banks/*
```

只要你把新的来源目录放进去，设置页就会显示自动发现结果。之后保存并重建索引即可。

如果某个目录不想再自动识别，把它移出 `sources/`。

## 手动配置

除了自动发现，设置页和配置文件都支持两类来源：

- `type: "local"`
- `type: "git"`

示例：

```json
{
  "id": "custom-guide-repo",
  "type": "git",
  "url": "https://github.com/replace-with-your/guide-repo.git",
  "branch": "main",
  "kind": "guide"
}
```

## 私有本地覆盖

不要直接改追踪中的默认配置。推荐使用：

```bash
OFFERLOOM_SOURCES_CONFIG=./config/sources.local.example.json \
OFFERLOOM_WORK_MANIFEST=./config/work-manifest.local.example.json \
npm run setup:serve
```

运行时保存的配置会写到：

- `config/sources.runtime.json`
- `config/work-manifest.runtime.json`

这两个文件默认不会进入 Git。

## `myWork` 字段

`myWork` 支持：

- `path`: 工作集根目录
- `supplementalRoots`: 补充检索根目录
- `manifestPath`: manifest 路径

## 去重与增量

面经导入时会在建库阶段做 canonical dedup：

- 提取问题行、标题、表格、`Q:` 段落
- 规范化成统一指纹
- 相同问题只保留一份主记录

新增题库后，重新建索引即可把新题导入并自动去重。
