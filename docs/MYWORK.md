# MyWork Guide

`mywork/` 是 OfferLoom 生成个性化答案时最重要的私有输入。

它不是可有可无的附件，而是系统判断你“到底做过什么、能讲到什么深度、哪些项目应该止损跳过”的主语料入口。

## 推荐放什么

每个项目尽量放全：

- `README.md`
- 论文 PDF / 草稿 / 已录用稿
- 代码
- notebook
- 实验记录
- benchmark 结果
- 设计文档
- 调试复盘
- 部署记录

如果只有纯代码，没有 README 或设计说明，系统仍然会扫，但能生成出来的面试回答通常会弱很多。

## 推荐结构

```text
mywork/
├── README.md
├── project-a/
│   ├── README.md
│   ├── paper.pdf
│   ├── notes/
│   ├── notebooks/
│   └── src/
├── project-b/
│   ├── README.md
│   ├── docs/
│   └── code/
```

## 扫描策略

OfferLoom 对 `mywork` 的处理是保守的：

1. 先判断一个目录像不像真实项目。
2. 如果结构明显不匹配，就及时止损，不继续深挖。
3. 对通过初筛的项目，递归读取 README、文档、代码、PDF、notebook 等材料。
4. 再判断它和当前面试方向是否真的相关。
5. 弱相关或无关项目会被降权，避免生成“硬贴经历”的假答案。
6. 强相关项目才会被抽成项目事实、追问点、答题切入口和引用证据。

## 最能提升效果的做法

- 保持 `mywork/README.md` 更新，它是你的跨项目总览。
- 每个项目根目录至少放一个强 README。
- 重要 PDF 旁边再补一份 markdown 摘要。
- 明确写清楚你的 ownership、技术决策、失败、指标变化和复盘。
- 如果某个项目和目标岗位没关系，也不用删，系统会尽量止损跳过。

## 路径约定

默认推荐使用仓库根目录的 `./mywork/`。

如果你的真实工作集不在这里，也可以：

- 在设置页直接改 `mywork` 路径
- 用 `config/sources.local.example.json` 做本地私有覆盖

这个目录默认被 `.gitignore` 忽略，不会随仓库发布。
