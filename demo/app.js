const $ = (selector) => document.querySelector(selector)

const state = {
  activeCategory: '全部',
  activeQuestionId: null,
  config: null,
  data: null
}

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function loadJson(path) {
  const response = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`加载失败: ${path}`)
  }
  return response.json()
}

function renderHeader() {
  const config = state.config
  $('#site-title').textContent = config.siteTitle || 'OfferPotato Demo'
  $('#site-subtitle').textContent = config.subtitle || '纯前端展示版'
  $('#demo-badge').textContent = config.demoBadge || 'Demo Mode'
  $('#last-updated').textContent = `更新时间: ${config.lastUpdated || '-'}`
}

function renderStats() {
  const container = $('#stats-grid')
  const cards = state.data.stats
    .map((item) => `
      <article class="stat-card">
        <div class="label">${esc(item.label)}</div>
        <div class="value">${esc(item.value)}</div>
      </article>
    `)
    .join('')

  container.innerHTML = cards
}

function renderChapters() {
  const container = $('#chapter-list')
  container.innerHTML = state.data.chapters
    .map((chapter) => {
      const progress = Math.max(0, Math.min(100, Number(chapter.progress) || 0))
      return `
        <article class="chapter-item">
          <div class="chapter-head">
            <h3>${esc(chapter.title)}</h3>
            <span>${esc(chapter.questionCount)} 题 · 完成 ${progress}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
        </article>
      `
    })
    .join('')
}

function categories() {
  const set = new Set(state.data.questions.map((item) => item.category))
  return ['全部', ...set]
}

function filteredQuestions() {
  if (state.activeCategory === '全部') {
    return state.data.questions
  }
  return state.data.questions.filter((q) => q.category === state.activeCategory)
}

function difficultyLabel(level) {
  if (level === 'easy' || level === 'hard' || level === 'medium') {
    return level
  }
  return 'medium'
}

function renderTabs() {
  const container = $('#category-tabs')
  container.innerHTML = categories()
    .map((category) => `
      <button class="tab ${category === state.activeCategory ? 'active' : ''}" data-category="${esc(category)}">
        ${esc(category)}
      </button>
    `)
    .join('')

  container.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const nextCategory = tab.dataset.category || '全部'
      state.activeCategory = nextCategory
      const list = filteredQuestions()
      state.activeQuestionId = list[0]?.id || null
      renderTabs()
      renderQuestionList()
      renderAnswerCard()
    })
  })
}

function renderQuestionList() {
  const container = $('#question-list')
  const list = filteredQuestions()

  if (list.length === 0) {
    container.innerHTML = '<p>当前分类暂无示例题。</p>'
    return
  }

  container.innerHTML = list
    .map((q) => {
      const active = q.id === state.activeQuestionId
      const difficulty = difficultyLabel(q.difficulty)
      return `
        <article class="question-item ${active ? 'active' : ''}" data-qid="${esc(q.id)}">
          <div class="question-meta">
            <span>${esc(q.chapter)}</span>
            <span class="pill ${difficulty}">${esc(difficulty)}</span>
            <span>${esc(q.category)}</span>
          </div>
          <div class="question-title">${esc(q.title)}</div>
        </article>
      `
    })
    .join('')

  container.querySelectorAll('.question-item').forEach((item) => {
    item.addEventListener('click', () => {
      state.activeQuestionId = item.dataset.qid
      renderQuestionList()
      renderAnswerCard()
    })
  })
}

function renderAnswerCard() {
  const card = $('#answer-card')
  const question = state.data.questions.find((item) => item.id === state.activeQuestionId)

  if (!question) {
    card.classList.add('empty')
    card.innerHTML = '<p>点击上方任意题目，查看示例回答和项目映射。</p>'
    return
  }

  card.classList.remove('empty')
  card.innerHTML = `
    <h3>${esc(question.title)}</h3>

    <div class="answer-block">
      <h4>示例回答</h4>
      <p>${esc(question.answer)}</p>
    </div>

    <div class="answer-block">
      <h4>项目映射</h4>
      <p>${esc(question.projectEvidence)}</p>
    </div>

    <div class="answer-block">
      <h4>追问方向</h4>
      <ul>
        ${(question.followUps || []).map((item) => `<li>${esc(item)}</li>`).join('')}
      </ul>
    </div>

    <div class="note">
      Demo 模式说明：这里是静态示例内容，不会请求后端，也不会触发模型推理。
    </div>
  `
}

async function bootstrap() {
  const [config, data] = await Promise.all([
    loadJson('./runtime-config.json'),
    loadJson('./data/demo-data.json')
  ])

  state.config = config
  state.data = data

  state.activeQuestionId = state.data.questions[0]?.id || null

  renderHeader()
  renderStats()
  renderChapters()
  renderTabs()
  renderQuestionList()
  renderAnswerCard()
}

bootstrap().catch((error) => {
  const card = $('#answer-card')
  card.classList.remove('empty')
  card.innerHTML = `<p>加载失败：${esc(error.message || String(error))}</p>`
})
