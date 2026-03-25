type ProjectDoc = {
  ext: string
  id: string
  meta: Record<string, unknown>
  relPath: string
  title: string
  content: string
}

type ProjectQuestion = {
  difficulty: string
  generatedStatus: string | null
  id: string
  maxScore: number
  questionType: string
  text: string
}

type ProjectRecord = {
  id: string
  meta: Record<string, unknown>
  name: string
  rootPath: string
  status: string
  summary: string
}

export type ProjectPrepQuestion = {
  answerAngle: string
  category: string
  id: string
  intent: string
  question: string
  sourceLabel: string
}

export type ProjectPrep = {
  deepDiveQuestions: ProjectPrepQuestion[]
  highlightFacts: Array<{
    label: string
    sourceLabel: string
    value: string
  }>
  interviewArc: string[]
  openingPitch: string
  relatedQuestions: Array<{
    generatedStatus: string | null
    id: string
    maxScore: number
    questionType: string
    text: string
    whyRelevant: string
  }>
  sourceDocuments: Array<{
    ext: string
    id: string
    originKind?: string
    relPath: string
    title: string
  }>
  whyThisProjectMatters: string
}

export function buildProjectPrep(
  project: ProjectRecord,
  documents: ProjectDoc[],
  relatedQuestions: ProjectQuestion[]
): ProjectPrep {
  const rankedDocs = [...documents].sort((left, right) => scoreDocumentForNarrative(right) - scoreDocumentForNarrative(left))
  const primaryDoc = rankedDocs[0] ?? null
  const facts = extractProjectFacts(rankedDocs)
  const profile = inferProjectProfile(project, rankedDocs)
  const related = relatedQuestions
    .map((item) => ({
      ...item,
      bridgeScore: scoreQuestionForProject(item.text, profile)
    }))
    .filter((item) => item.bridgeScore >= 0.2 || item.maxScore >= 0.42)
    .sort((left, right) => right.bridgeScore - left.bridgeScore || right.maxScore - left.maxScore)
    .slice(0, 6)
    .map(({ bridgeScore: _bridgeScore, ...item }) => ({
      ...item,
      whyRelevant: explainQuestionBridge(item.text, profile)
    }))

  const openingPitch = buildOpeningPitch(project, profile, facts)
  const whyThisProjectMatters = buildProjectValue(project, profile, facts)
  const interviewArc = buildInterviewArc(project, profile, facts, primaryDoc)
  const deepDiveQuestions = buildDeepDiveQuestions(project, profile, facts, related)

  return {
    openingPitch,
    whyThisProjectMatters,
    interviewArc,
    highlightFacts: facts.slice(0, 6),
    deepDiveQuestions,
    relatedQuestions: related,
    sourceDocuments: rankedDocs.slice(0, 6).map((item) => ({
      ext: item.ext,
      id: item.id,
      originKind: typeof item.meta.originKind === 'string' ? item.meta.originKind : undefined,
      relPath: item.relPath,
      title: item.title
    }))
  }
}

function scoreDocumentForNarrative(document: ProjectDoc) {
  let score = 0
  const normalized = `${document.title}\n${document.relPath}\n${document.content.slice(0, 2000)}`.toLowerCase()
  const originKind = typeof document.meta.originKind === 'string' ? document.meta.originKind : ''

  if (originKind === 'primary') {
    score += 3
  }
  if (/readme|总览|overview|导读|index/.test(normalized)) {
    score += 3
  }
  if (['md', 'mdx', 'markdown'].includes(document.ext)) {
    score += 2.4
  } else if (document.ext === 'ipynb') {
    score += 1.6
  } else if (document.ext === 'pdf') {
    score += 0.8
  }
  if (/(个人贡献|技术栈|成果\/状态|系统架构|核心内容|简介|自然语言|多智能体|pipeline|challenge|debug|任务完成率|成功率)/i.test(normalized)) {
    score += 2
  }

  return score
}

function extractProjectFacts(documents: ProjectDoc[]) {
  const rules = [
    { label: '项目目标', pattern: /(简介|解决的问题|核心内容|这是什么|项目的顶层总览|核心思路|核心目的是)/i },
    { label: '你的角色', pattern: /(个人贡献|本人角色|角色|作者之一|独立完成|参与项目)/i },
    { label: '技术方案', pattern: /(技术栈|系统架构|工作方式|核心改动|整体架构|关键能力|核心改进)/i },
    { label: '结果证据', pattern: /(成果\/状态|任务完成率|成功率|验证通过|已.*成功|已在.*运行|已接收|录用|合入|开源准备中)/i },
    { label: '难点与修复', pattern: /(挑战|疑难解答|bug|报错|稳定性|修复|fallback|误差|冲突)/i }
  ]

  const picked: Array<{ label: string; sourceLabel: string; value: string }> = []
  const seen = new Set<string>()

  for (const rule of rules) {
    for (const document of documents) {
      const snippet = findEvidenceSnippet(document.content, rule.pattern)
      if (!snippet) {
        continue
      }
      const key = `${rule.label}:${snippet}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      picked.push({
        label: rule.label,
        sourceLabel: document.title,
        value: snippet
      })
      break
    }
  }

  if (picked.length > 0) {
    return fillFallbackFacts(picked, documents)
  }

  const fallbackDoc = documents[0]
  return fallbackDoc ? fillFallbackFacts([{
    label: '项目摘要',
    sourceLabel: fallbackDoc.title,
    value: summarizeDocumentLead(fallbackDoc.content) || fallbackDoc.title
  }], documents) : []
}

function inferProjectProfile(project: ProjectRecord, documents: ProjectDoc[]) {
  const combined = `${project.name}\n${documents.map((item) => `${item.title}\n${item.relPath}\n${item.content.slice(0, 3000)}`).join('\n\n')}`.toLowerCase()

  const themes = []
  if (/(llm|agent|multi-agent|planner|executor|evaluator|rag|embedding|tool|prompt|自然语言|多智能体)/i.test(combined)) {
    themes.push('llm_agent')
  }
  if (/(robot|ros2|moveit|xarm|rm65|teleop|maniskill|urdf|仿真|机械臂|遥操作|控制)/i.test(combined)) {
    themes.push('robotics_system')
  }
  if (/(pipeline|framework|workflow|模块化|架构|系统)/i.test(combined)) {
    themes.push('system_architecture')
  }
  if (/(benchmark|evaluation|metric|success rate|generalization|任务完成率|成功率|评估|泛化)/i.test(combined)) {
    themes.push('evaluation')
  }
  if (/(debug|stability|error|fallback|修复|误差|冲突|稳定性)/i.test(combined)) {
    themes.push('debugging')
  }

  return {
    combined,
    primaryTheme: themes[0] ?? 'engineering_project',
    themes
  }
}

function buildOpeningPitch(
  project: ProjectRecord,
  profile: ReturnType<typeof inferProjectProfile>,
  facts: ReturnType<typeof extractProjectFacts>
) {
  const goal = facts.find((item) => item.label === '项目目标')?.value
  const role = facts.find((item) => item.label === '你的角色')?.value
  const outcome = facts.find((item) => item.label === '结果证据')?.value

  const topic = describeTheme(profile.primaryTheme)
  return [
    `${project.name} 是一个偏 ${topic} 的项目。`,
    goal ? `它主要解决的是：${goal}` : '我会先用一句话说明项目要解决的问题和系统边界。',
    role ? `我在里面最值得展开的是：${role}` : '面试里我会把重点放在自己真实负责的模块，不会泛化到整个团队。',
    outcome ? `最终结果上，我会用这类证据收尾：${outcome}` : '最后我会用验证结果、上线状态或实验指标来收口。'
  ].join(' ')
}

function buildProjectValue(
  project: ProjectRecord,
  profile: ReturnType<typeof inferProjectProfile>,
  facts: ReturnType<typeof extractProjectFacts>
) {
  const stack = facts.find((item) => item.label === '技术方案')?.value
  const outcome = facts.find((item) => item.label === '结果证据')?.value
  const challenge = facts.find((item) => item.label === '难点与修复')?.value

  return [
    `${project.name} 适合做面试主项目，因为它同时覆盖了“你做了什么、为什么这么设计、遇到什么问题、最终怎么证明有效”这四个关键面。`,
    stack ? `技术层可以讲到 ${stack}` : '技术层可以重点讲模块边界、方案选择和系统串联方式。',
    challenge ? `难点层可以落到 ${challenge}` : '难点层则可以从真实 debug、 tradeoff 或约束条件切入。',
    outcome ? `结果层则有 ${outcome} 作为证据闭环。` : '结果层建议用可验证指标、运行状态或复现实验结果做闭环。'
  ].join(' ')
}

function buildInterviewArc(
  project: ProjectRecord,
  profile: ReturnType<typeof inferProjectProfile>,
  facts: ReturnType<typeof extractProjectFacts>,
  primaryDoc: ProjectDoc | null
) {
  const goal = facts.find((item) => item.label === '项目目标')?.value ?? '先说清楚项目目标、场景和为什么值得做'
  const role = facts.find((item) => item.label === '你的角色')?.value ?? defaultRoleAngle(project, profile)
  const stack = facts.find((item) => item.label === '技术方案')?.value ?? describeArchitectureAngle(profile)
  const challenge = facts.find((item) => item.label === '难点与修复')?.value ?? '挑一个真实问题，讲你如何定位、验证并修复'
  const outcome = facts.find((item) => item.label === '结果证据')?.value ?? '用上线状态、实验结果或可复现指标做结尾'

  return [
    `开场 30 秒：${project.name} 的核心目标是 ${goal}`,
    `角色边界：重点讲 ${role}`,
    `方案展开：把系统拆成 2-4 个模块，重点解释 ${stack}`,
    `深挖预警：面试官多半会追问你最难的一次 debug、tradeoff 或失败复盘，优先准备 ${challenge}`,
    `收尾闭环：最后一定回到 ${outcome}${primaryDoc ? `，必要时可反引 ${primaryDoc.title}` : ''}`
  ]
}

function buildDeepDiveQuestions(
  project: ProjectRecord,
  profile: ReturnType<typeof inferProjectProfile>,
  facts: ReturnType<typeof extractProjectFacts>,
  relatedQuestions: Array<{
    generatedStatus: string | null
    id: string
    maxScore: number
    questionType: string
    text: string
    whyRelevant: string
  }>
): ProjectPrepQuestion[] {
  const goal = facts.find((item) => item.label === '项目目标')
  const role = facts.find((item) => item.label === '你的角色')
  const stack = facts.find((item) => item.label === '技术方案')
  const outcome = facts.find((item) => item.label === '结果证据')
  const challenge = facts.find((item) => item.label === '难点与修复')

  const questions: ProjectPrepQuestion[] = [
    {
      id: `${project.id}-story`,
      category: '开场',
      question: `请你用 1 分钟介绍 ${project.name}：它解决什么问题、你具体做了什么、最后结果怎么样？`,
      intent: '这是项目主叙事问题，面试官会用它判断你是否能把技术经历讲清楚。',
      answerAngle: `按“背景 -> 目标 -> 我的角色 -> 结果”四步说。背景可用“${goal?.value ?? project.summary}”起手，角色重点放在“${role?.value ?? '自己直接负责的模块'}”，结尾一定落到“${outcome?.value ?? '可验证结果'}”。`,
      sourceLabel: goal?.sourceLabel ?? role?.sourceLabel ?? project.name
    },
    {
      id: `${project.id}-arch`,
      category: '架构',
      question: buildArchitectureQuestion(project, profile),
      intent: '这是典型深挖题，考察你是否真的理解系统边界、数据流和模块拆分。',
      answerAngle: `不要按文件夹念代码。优先用 2-4 个模块解释系统主链路，再说明为什么这样拆。这里最适合引用的是“${stack?.value ?? describeArchitectureAngle(profile)}”。`,
      sourceLabel: stack?.sourceLabel ?? project.name
    },
    {
      id: `${project.id}-tradeoff`,
      category: '取舍',
      question: `这个项目里你做过的一个关键技术取舍是什么？如果重来一次，你还会这么选吗？`,
      intent: '面试官想看你有没有工程判断，而不只是把方案实现出来。',
      answerAngle: `建议选一个真实决策点，比如模型/框架选型、模块边界、精度与速度、可解释性与复杂度的取舍。回答时用“约束条件 -> 可选方案 -> 为什么选当前方案 -> 代价是什么 -> 今天会不会改”这条线。`,
      sourceLabel: stack?.sourceLabel ?? project.name
    },
    {
      id: `${project.id}-debug`,
      category: '挑战',
      question: `这个项目里最难啃的一次问题是什么？你是怎么定位和修复的？`,
      intent: '这是最能区分真实做过和纸上谈兵的问题之一。',
      answerAngle: `用“现象 -> 猜测 -> 证据 -> 修复 -> 验证”来答，不要跳步骤。如果你已经有现成证据，优先用“${challenge?.value ?? '真实 bug 或稳定性问题'}”展开。`,
      sourceLabel: challenge?.sourceLabel ?? project.name
    },
    {
      id: `${project.id}-eval`,
      category: '验证',
      question: buildEvaluationQuestion(project, profile),
      intent: '考察你是否能证明项目有效，而不是只完成了功能堆砌。',
      answerAngle: `不要只说“效果不错”。请把验证拆成离线指标、线上/实机表现、失败案例和边界条件四层。现成证据可以优先落在“${outcome?.value ?? '已有结果或实验结论'}”。`,
      sourceLabel: outcome?.sourceLabel ?? project.name
    },
    {
      id: `${project.id}-ownership`,
      category: '边界',
      question: `这个项目里哪些部分是你主导的，哪些部分是协作完成的？如果把团队其他人的工作拿掉，你还能独立讲清哪些模块？`,
      intent: '这是校验 ownership 的高频问题，尤其适合论文作者或合作项目。',
      answerAngle: `诚实是关键。先明确自己的 ownership，再说明协作接口和团队分工。如果你是作者但不是核心代码负责人，更要主动说清“我参与了什么，不扩写什么”。`,
      sourceLabel: role?.sourceLabel ?? project.name
    },
    {
      id: `${project.id}-extension`,
      category: '延展',
      question: `如果面试官让你把 ${project.name} 再往前推进一版，你最先补哪一块？为什么？`,
      intent: '考察你的反思能力、产品化意识和下一步判断。',
      answerAngle: `优先选一个最真实的短板，例如评估覆盖、稳定性、部署复杂度、数据闭环或通用化能力。回答时用“当前瓶颈 -> 为什么它卡住系统上限 -> 下一版的落地路径”。`,
      sourceLabel: outcome?.sourceLabel ?? challenge?.sourceLabel ?? project.name
    }
  ]

  const bridge = relatedQuestions[0]
  if (bridge) {
    questions.push({
      id: `${project.id}-bridge-${bridge.id}`,
      category: '桥接题库',
      question: `如果面试官从这个项目继续追问到“${bridge.text}”，你会怎么把项目经历自然过渡过去？`,
      intent: '把项目深挖和通用题连起来，避免答到后面断档。',
      answerAngle: `先用一句话说明这道题为什么会从项目里自然长出来，然后从项目里抽一段可迁移经验，再补上通用定义和 tradeoff。这里的桥接理由是：${bridge.whyRelevant}`,
      sourceLabel: project.name
    })
  }

  return questions
}

function buildArchitectureQuestion(
  project: ProjectRecord,
  profile: ReturnType<typeof inferProjectProfile>
) {
  if (profile.themes.includes('llm_agent')) {
    return `${project.name} 里如果把系统拆成规划、执行、评估三个层次，你会怎么描述它们的输入输出和协作边界？`
  }
  if (profile.themes.includes('robotics_system')) {
    return `${project.name} 从上层任务指令到底层执行链路是怎么串起来的？关键模块之间如何通信和同步？`
  }
  return `${project.name} 的核心模块是怎么拆的？如果要让新人 10 分钟理解这个系统，你会画什么架构图？`
}

function buildEvaluationQuestion(
  project: ProjectRecord,
  profile: ReturnType<typeof inferProjectProfile>
) {
  if (profile.themes.includes('evaluation')) {
    return `${project.name} 里你是怎么定义“做成了”的？评估指标、验证集和失败案例分别怎么看？`
  }
  if (profile.themes.includes('robotics_system')) {
    return `${project.name} 在仿真或真机上，你怎么判断方案稳定、可靠、可复现？`
  }
  return `${project.name} 这个项目你最后是怎么验证它有效的？如果让你补评估，你会补哪一层？`
}

function describeTheme(theme: string) {
  switch (theme) {
    case 'llm_agent':
      return 'LLM / Agent 系统'
    case 'robotics_system':
      return '机器人系统集成'
    case 'system_architecture':
      return '系统架构'
    case 'evaluation':
      return '评测与验证'
    default:
      return '工程实现'
  }
}

function describeArchitectureAngle(profile: ReturnType<typeof inferProjectProfile>) {
  if (profile.themes.includes('llm_agent')) {
    return '任务规划、工具执行、结果评估之间的闭环'
  }
  if (profile.themes.includes('robotics_system')) {
    return '上层任务逻辑、感知模块、控制执行链路之间的接口设计'
  }
  return '模块划分、数据流和工程边界'
}

function explainQuestionBridge(questionText: string, profile: ReturnType<typeof inferProjectProfile>) {
  const normalized = questionText.toLowerCase()
  if (profile.themes.includes('llm_agent') && /(agent|function|langchain|tool|mcp|prompt|rag)/i.test(normalized)) {
    return '这个项目本身就包含 Agent/工具编排/自然语言交互的元素，适合从项目实现桥接到通用智能体问题。'
  }
  if (profile.themes.includes('evaluation') && /(evaluate|evaluation|metric|judge|benchmark|评估|指标)/i.test(normalized)) {
    return '项目里有明确的验证目标或结果指标，可以自然过渡到更通用的评估方法问题。'
  }
  if (profile.themes.includes('robotics_system') && /(system|architecture|pipeline|robust|reliability|integration|interface|synchronization)/i.test(normalized)) {
    return '这个项目能提供系统拆分、链路稳定性和工程 tradeoff 的真实例子。'
  }
  return '这道题和项目里的架构选择、实现细节或验证方式有天然关联，可以先讲项目，再上升到抽象方法。'
}

function scoreQuestionForProject(questionText: string, profile: ReturnType<typeof inferProjectProfile>) {
  const normalized = questionText.toLowerCase()
  let score = 0

  if (profile.themes.includes('llm_agent') && /(agent|function|langchain|tool|mcp|rag|prompt|embedding|vector|judge)/i.test(normalized)) {
    score += 0.7
  }
  if (profile.themes.includes('robotics_system') && /(robot|robotic|control|policy|simulation|sim2real|world model|manipulation|ros|moveit|teleop|grasp|real2sim2real)/i.test(normalized)) {
    score += 0.7
  }
  if (profile.themes.includes('evaluation') && /(evaluate|evaluation|metric|benchmark|judge|评估|指标|benchmark)/i.test(normalized)) {
    score += 0.5
  }
  if (profile.themes.includes('system_architecture') && /(system|architecture|pipeline|scal|design|module|interface|reliability)/i.test(normalized)) {
    score += 0.35
  }

  if (/(difference between|what is|how do you)/i.test(normalized)) {
    score += 0.08
  }

  return Number(Math.min(1, score).toFixed(4))
}

function summarizeDocumentLead(content: string) {
  const paragraphs = extractParagraphs(content)
  return paragraphs[0] ?? ''
}

function findEvidenceSnippet(content: string, pattern: RegExp) {
  const paragraphs = extractParagraphs(content)
  const match = paragraphs.find((paragraph) => pattern.test(paragraph) && !isLowValueSnippet(paragraph))
  return match ? trimSentence(match) : null
}

function extractParagraphs(content: string) {
  const normalized = content
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((chunk) => cleanText(chunk))
    .filter(Boolean)

  return normalized.filter((paragraph) => paragraph.length >= 20 && paragraph.length <= 260 && !isLowValueSnippet(paragraph))
}

function cleanText(input: string) {
  return input
    .replace(/^#+\s*/gm, '')
    .replace(/^\|.*\|$/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/^\s*[-*]\s*\[[ xX]\]\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+[.)]\s+/gm, '')
    .replace(/`+/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function trimSentence(input: string) {
  const compact = input.replace(/\s+/g, ' ').trim()
  return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact
}

function fillFallbackFacts(
  currentFacts: Array<{ label: string; sourceLabel: string; value: string }>,
  documents: ProjectDoc[]
) {
  const facts = [...currentFacts]
  const hasLabel = (label: string) => facts.some((item) => item.label === label)
  const primaryDoc = documents[0]
  const preferredDocs = [...documents].sort((left, right) => Number(left.ext === 'pdf') - Number(right.ext === 'pdf'))
  const leads = documents.flatMap((document) => extractParagraphs(document.content).slice(0, 3).map((value) => ({
    sourceLabel: document.title,
    value
  })))

  if (!hasLabel('项目目标')) {
    const candidate = leads.find((item) => /(旨在|实现|用于|提供|框架|系统|pipeline|项目|任务|分析|控制|迁移)/i.test(item.value))
      ?? leads[0]
    if (candidate) {
      facts.push({
        label: '项目目标',
        sourceLabel: candidate.sourceLabel,
        value: trimSentence(candidate.value)
      })
    }
  }

  if (!hasLabel('技术方案')) {
    const candidate = preferredDocs
      .map((document) => ({
        sourceLabel: document.title,
        value: findEvidenceSnippet(document.content, /(pipeline|框架|模块|policy|simulation|rendering|planner|executor|evaluator|moveit|ros2|ppo|qvpo|taichi|gaussian splatting|foundationpose|agent)/i)
      }))
      .find((item) => item.value)
    if (candidate?.value) {
      facts.push({
        label: '技术方案',
        sourceLabel: candidate.sourceLabel,
        value: candidate.value
      })
    }
  }

  if (!hasLabel('结果证据')) {
    const candidate = preferredDocs
      .map((document) => ({
        sourceLabel: document.title,
        value: findEvidenceSnippet(document.content, /(real2sim2real|real-world|真实 xarm|真实环境|完整.*pipeline|无缝迁移|稳定运行|success|成功|验证|接收|上线|任务完成率|成功率|sim2real transfer)/i)
      }))
      .find((item) => item.value)
    if (candidate?.value) {
      facts.push({
        label: '结果证据',
        sourceLabel: candidate.sourceLabel,
        value: candidate.value
      })
    }
  }

  if (!hasLabel('难点与修复')) {
    const candidate = preferredDocs
      .map((document) => ({
        sourceLabel: document.title,
        value: findEvidenceSnippet(document.content, /(挑战|复杂|sensitivity|高敏感|差距|gap|优化|修复|误差|稳定性|冲突)/i)
      }))
      .find((item) => item.value)
    if (candidate?.value) {
      facts.push({
        label: '难点与修复',
        sourceLabel: candidate.sourceLabel,
        value: candidate.value
      })
    }
  }

  if (!hasLabel('你的角色') && primaryDoc) {
    const fallback = inferRoleFallback(primaryDoc.title)
    if (fallback) {
      facts.push({
        label: '你的角色',
        sourceLabel: 'OfferLoom 自动提示',
        value: fallback
      })
    }
  }

  return facts
}

function inferRoleFallback(title: string) {
  if (/复现|reproduce/i.test(title)) {
    return '这是复现/落地型项目，面试里应强调你负责把论文方法真正跑通、调通并完成验证的部分。'
  }
  if (/作者|paper|iclr|neurips|arxiv/i.test(title)) {
    return '这是论文/合作项目，面试里要主动区分自己的真实贡献和论文整体贡献。'
  }
  return null
}

function defaultRoleAngle(project: ProjectRecord, profile: ReturnType<typeof inferProjectProfile>) {
  if (/复现/i.test(project.name)) {
    return '强调你把论文链路从数据、训练到部署真正跑通和验证的部分'
  }
  if (profile.themes.includes('llm_agent')) {
    return '明确自己负责的是系统理解、数据/实验/模块集成，哪些不是你主导的也要说清'
  }
  return '明确区分你负责的模块与团队其他成员的边界'
}

function isLowValueSnippet(input: string) {
  return /(来源说明|不应外扩|release the code|quick start|installation|conda activate|git clone|python scripts\/|^todo$|步骤\s*\d|目录结构|repository structure|contact & support|citation|license|project page|paper\)|issue 区|训练 the world model)/i.test(input)
}
