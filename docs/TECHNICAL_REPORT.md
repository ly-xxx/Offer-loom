# Technical Report

## 1. 产品目标

OfferLoom 不是一个普通的题库站，而是一个“主线学习 + 面经回流 + 个人工作证据约束”的面试准备系统。

它要解决三个常见问题：

1. 题库和知识主线脱节
   用户刷题很多，但不知道这些题分别落在哪个知识点上。
2. 面经和项目经历脱节
   用户很容易在基础题上硬贴项目，也容易在项目深挖题上说不出证据。
3. 检索系统过度自信
   很多 RAG 系统会把“差不多相关”的结果误当成“精确命中”，最后把用户带偏。

OfferLoom 的设计目标是：

- 把完整指南读成主线
- 把面经折成注脚和反引
- 把 `mywork` 变成受证据约束的个性化答案材料
- 在 UI 上明确区分“精确命中”“章节兜底”“没有出现”

## 2. 系统输入与输出

### 输入

- Guide / 主线文档
  一套按学习顺序组织的知识文档仓库
- Question banks / 面经题库
  面试题、面经记录、问答仓库、截图 OCR 导入内容
- `mywork`
  项目 README、代码、论文、笔记、notebook、实验记录等

### 输出

- 在线文档站
  以主线文档为中心，面经题目作为章节注脚与章末延伸题出现
- 面经 tab
  以题目为中心，显示主线出现情况、频次、反引和个性化答案
- 个性化答案
  明确标注 `direct / adjacent / none`

## 3. 为什么采用 “exact hit + chapter fallback” 两层设计

主流 hybrid retrieval / RAG 系统通常不会只做一次检索就把结果直接端给用户，而是会做：

- lexical + semantic 的混合召回
- rerank / precision filtering
- 对高层主题相关但不够精确的结果单独保留，而不是伪装成精确 chunk 命中

OfferLoom 把这个思想拆成了两层：

1. `question_to_section`
   只有高相关、足以挂到具体知识点上的题，才进入正文知识命中和章节注脚。
2. `question_to_document_fallback`
   如果题目明显属于这一章的大意，但不足以命中某个具体段落，就只进入“章节延伸题”。

这样做的好处是：

- 用户一眼能看出哪些题是真的命中了知识点
- 避免把弱相关题强塞进某一段正文
- 兼顾学习顺序和题库覆盖

## 4. 匹配算法

### 4.1 主线文档匹配

针对每个面试题，系统会同时计算：

- lexical score
- semantic score
- heading match score
- soft overlap score
- topic alignment score
- intent alignment score

然后做两次筛选：

1. 先判断能否进入具体 section
2. 再判断是否只能进入 document-level fallback

这比“只按 embedding 相似度取 top-k”更稳，因为：

- heading / topic / intent 会补足仅靠向量相似度带来的误命中
- fallback bucket 可以承接“主题对，但段落不够准”的题

### 4.2 `mywork` 匹配

`mywork` 的目标不是“尽量多贴项目”，而是“只在真实有帮助时贴项目”。

因此系统对 `mywork` 做三层判断：

1. `question_to_work`
   真正可以当成直接证据的项目材料
2. `question_to_work_hint`
   只有相邻工程经验，允许贴边，但不能伪装成直接同题经验
3. 无命中
   就不要引用项目

### 4.3 直接证据与相邻证据

OfferLoom 不再只看“有几个关键词重合”，而是额外引入了：

- family-level precision rules
  例如 `prompt/context`、`RAG`、`agent`、`inference-serving`、`robotics-control`
- compatibility bonus
  允许相近家族之间形成相邻桥接，但不自动升级成 direct
- precision guard
  某些精确概念题如果候选文档里根本没有该概念，就直接否掉

例如：

- 一个只是在机器人 README 里出现了 `prompt` 示例的文档，不应该自动成为 prompt engineering 题的 direct evidence
- 一个通用的 LLM multi-agent 项目，虽然不一定直接覆盖 prompt tuning，但可以作为 prompt / agent 方向的 adjacent evidence

## 5. 为什么不强迫每道题都结合项目

很多系统在生成个性化答案时会有一个坏习惯：

- 先假定“必须结合项目”
- 再去硬找一个项目片段贴上去

OfferLoom 明确不这样做。

现在的生成策略是：

- 如果 `direct`
  可以结合项目，但仍要求引用可追溯
- 如果 `adjacent`
  只能说“这是相邻经验”，不能说“我就做过这道题本身”
- 如果 `none`
  直接承认没有项目证据，按主线知识回答
- 如果题目很简单
  即使有项目，也可以不贴项目，避免回答变形

## 6. 题目去重

面经源往往会出现大量“同义改写题”。

OfferLoom 的去重不是只看原文是否完全相同，而是会做：

- canonical text 归一化
- question fingerprint
- 常见英文词形变化归一化
- UI 层再做一次 section 内去重

这能减少：

- 同义题在同一章节底部反复出现
- 同义题把面经分类列表刷得很乱

## 7. 界面结构

### 7.1 主线 tab

- 左侧是一级 / 二级树
- 正文是同一一级菜单下的连续文档流
- 章节底部放“相关面试题”
- 文档末尾放“章节延伸题”

### 7.2 面经 tab

面经 tab 的重点不是“把题列表堆出来”，而是清楚回答四件事：

1. 这道题是否出现在主线里
2. 出现了几次
3. 是精确命中还是章节兜底
4. 点击后能跳回哪里

因此正文中会保留：

- 主线出现状态
- 频次
- 反引入口
- `mywork` 证据质量

### 7.3 2.5D 指示灯

UI 上的状态灯不是装饰，而是信息压缩：

- 绿色：主线精确命中
- 金色：只有章节候选
- 灰色：主线未出现

这让用户在侧边栏就能快速判断：

- 哪些题应该跟着主线学
- 哪些题属于章末补充
- 哪些题目前只能靠题库和动态回答

## 8. 部署与发布

### 8.1 一键部署

发布版默认推荐：

```bash
npm install
npm run setup:serve
```

它会自动完成：

- 依赖安装
- Git 来源同步
- 数据库构建
- 前后端构建
- `6324` 端口启动

### 8.2 前端可视化配置

第一次启动后，用户可以直接在前端：

- 选择保留默认公开源，或改成自定义源
- 指定 `mywork` 目录
- 启动索引并观察实时进度

这意味着 GitHub 用户即使不想手改配置文件，也能通过 UI 完成大部分初始配置。

### 8.3 发布边界

发布到 GitHub 时：

- 公开示例源保留在仓库里
- `mywork/` 不提交
- runtime config 不提交
- 数据库和生成答案不提交

## 9. 与主流检索系统的关系

OfferLoom 当前的匹配策略，是对主流 hybrid search / reranking 思路做了面试场景化改造，而不是另起炉灶。

主要参考方向包括：

- Weaviate 的 hybrid search 文档
  <https://docs.weaviate.io/weaviate/concepts/search/hybrid-search>
- Qdrant 的 reranking for hybrid search 文档
  <https://qdrant.tech/documentation/search-precision/reranking-hybrid-search/>

OfferLoom 在这些通用范式之上，额外补了一层“学习文档站语义”：

- 精确段落命中
- 章节兜底
- `mywork` 证据诚实分级
- 面经反引和主线出现状态可视化

最近这一轮又进一步收紧了两个细节：

- 把 `LLM serving / inference` 从泛 `llm_model` 里拆出来单独做 family-level precision gate
- 题目 fingerprint 由“顺序字符串”改成“归一化 token 集合”，降低同义改写题重复出现的概率

## 10. 当前局限

- 主线与题目的 exact hit 仍然是高质量启发式，而不是更重型的 reranker / cross-encoder
- `mywork` 的相关性判断已经更保守，但在极边缘案例下仍可能出现“相邻但不够漂亮”的 hint 排序
- 题目去重目前是 fingerprint + 规则，不是语义聚类

这些局限是明确可继续升级的，但当前版本已经优先保证：

- 不乱贴项目
- 不乱挂知识点
- UI 上把不确定性显式暴露出来

## 11. 进一步参考

除了上面的 Weaviate / Qdrant，OfferLoom 的融合思路也和主流 RRF / hybrid rerank 系统一致：

- Elasticsearch hybrid search / RRF
  <https://www.elastic.co/guide/en/elasticsearch/reference/current/rrf.html>

OfferLoom 当前没有直接照搬某个通用检索框架，而是把这些成熟思路压缩成更适合“学习主线 + 面经反引 + 项目证据约束”这个场景的实现。
