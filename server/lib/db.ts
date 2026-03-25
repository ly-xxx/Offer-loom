import Database from 'better-sqlite3'

import { DB_PATH } from './constants.js'
import { buildProjectPrep } from './projectPrep.js'
import { readLiveContent, splitIntoSections } from './text.js'

type JsonRecord = Record<string, unknown>
const QUESTION_FINGERPRINT_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'between', 'does', 'difference', 'different', 'do', 'explain', 'how',
  'in', 'is', 'it', 'its', 'of', 'the', 'their', 'them', 'to', 'used', 'what', 'where', 'why'
])

export type DocumentListItem = {
  ext: string
  id: string
  kind: string
  knowledgeHitCount?: number
  path: string
  relPath: string
  sourceId: string
  title: string
  updatedAt: string
  watchPath?: string | null
}

type SectionQuestionRow = {
  anchor: string
  difficulty: string
  generatedOutputJson: string | null
  generatedStatus: string | null
  metadataJson: string
  orderIndex: number
  questionId: string
  questionType: string
  score: number
  text: string
}

export type QuestionListItem = {
  categoryId: string
  categoryLabel: string
  categoryOrder: number
  company: string | null
  displayText: string
  difficulty: string
  guideFallbackCount: number
  generatedStatus: string | null
  guideLinkCount: number
  id: string
  interviewDate: string | null
  interviewFacet: string
  importOrigin: string | null
  questionType: string
  role: string | null
  sourceId: string
  sourcePath: string
  sourceTitle: string
  text: string
  translatedText: string | null
  workLinkCount: number
}

type LooseQuestionRow = {
  difficulty: string
  generatedOutputJson: string | null
  generatedStatus: string | null
  metadataJson: string
  questionId: string
  questionType: string
  score: number
  text: string
}

type WorkProjectRow = {
  id: string
  metaJson: string
  name: string
  rootPath: string
  status: string
  summary: string
}

export class OfferLoomDb {
  private db: Database.Database
  private databasePath: string

  constructor(databasePath = DB_PATH) {
    this.databasePath = databasePath
    this.db = new Database(databasePath, { readonly: false })
  }

  close() {
    this.db.close()
  }

  reopen(databasePath = this.databasePath) {
    this.close()
    this.databasePath = databasePath
    this.db = new Database(databasePath, { readonly: false })
  }

  getPath() {
    return this.databasePath
  }

  getMeta() {
    const counts = {
      documents: this.scalar<number>('SELECT COUNT(*) AS value FROM documents'),
      guides: this.scalar<number>(`SELECT COUNT(*) AS value FROM documents WHERE kind = 'guide'`),
      questions: this.scalar<number>('SELECT COUNT(*) AS value FROM questions'),
      translatedQuestions: this.scalar<number>(`SELECT COUNT(*) AS value FROM questions WHERE metadata_json LIKE '%"translatedText"%'`),
      generatedAnswers: this.scalar<number>(`SELECT COUNT(*) AS value FROM generated_answers WHERE status = 'ready'`),
      workProjects: this.scalar<number>('SELECT COUNT(*) AS value FROM work_projects')
    }
    const retrievalMode = this.readAppMeta('retrieval_mode')
    const embeddingModel = this.readAppMeta('embedding_model')
    const embeddingError = this.readAppMeta('embedding_error')
    const workIndexSummary = safeJson(this.readAppMeta('work_index_summary'))

    return {
      counts,
      retrievalMode,
      embeddingModel,
      embeddingError,
      workIndexSummary,
      models: ['gpt-5.4', 'gpt-5.2', 'gpt-5'],
      reasoningEfforts: ['low', 'medium', 'high', 'xhigh']
    }
  }

  listQuestions(search = '', limit = 120, category = ''): QuestionListItem[] {
    const hasSearch = search.trim().length > 0
    const hasCategory = category.trim().length > 0
    const whereClauses: string[] = []

    if (hasSearch) {
      whereClauses.push('(q.text LIKE @search OR q.metadata_json LIKE @search)')
    }
    if (hasCategory) {
      whereClauses.push('q.metadata_json LIKE @category')
    }

    const query = `
      SELECT
        q.id,
        q.text,
        q.metadata_json AS metadataJson,
        q.question_type AS questionType,
        q.difficulty,
        q.source_id AS sourceId,
        d.title AS sourceTitle,
        d.rel_path AS sourceRelPath,
        COALESCE(SUM(CASE WHEN l.relation = 'question_to_section' THEN 1 ELSE 0 END), 0) AS guideLinkCount,
        COALESCE(SUM(CASE WHEN l.relation = 'question_to_document_fallback' THEN 1 ELSE 0 END), 0) AS guideFallbackCount,
        COALESCE(SUM(CASE WHEN l.relation = 'question_to_work' THEN 1 ELSE 0 END), 0) AS workLinkCount,
        ga.status AS generatedStatus
      FROM questions q
      JOIN documents d ON d.id = q.document_id
      LEFT JOIN links l ON l.from_id = q.id
      LEFT JOIN generated_answers ga ON ga.question_id = q.id
      ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
      GROUP BY q.id
      ORDER BY guideLinkCount DESC, guideFallbackCount DESC, workLinkCount DESC, q.text ASC
      LIMIT @limit
    `

    const rows = this.db.prepare(query).all({
      category: `%"primaryCategory":"${category.trim()}"%`,
      search: `%${search.trim()}%`,
      limit
    }) as Array<Omit<QuestionListItem, 'categoryId' | 'categoryLabel' | 'categoryOrder' | 'company' | 'displayText' | 'interviewDate' | 'interviewFacet' | 'importOrigin' | 'role' | 'sourcePath' | 'translatedText'> & {
      metadataJson: string
      sourceRelPath: string
    }>

    return rows.map(({ metadataJson, sourceRelPath, ...item }) => {
      const metadata = safeJson(metadataJson) as Record<string, unknown>
      const translatedText = readTranslatedText(metadata)
      const category = readPrimaryCategory(metadata)
      return {
        ...item,
        categoryId: category.id,
        categoryLabel: category.label,
        categoryOrder: category.order,
        company: readNullableMetadataString(metadata, 'company'),
        displayText: translatedText ?? item.text,
        interviewDate: readNullableMetadataString(metadata, 'interviewDate'),
        interviewFacet: readNullableMetadataString(metadata, 'interviewFacet') ?? 'knowledge',
        importOrigin: readNullableMetadataString(metadata, 'importOrigin'),
        role: readNullableMetadataString(metadata, 'role'),
        sourcePath: buildSourceReference(item.sourceId, sourceRelPath),
        translatedText
      }
    })
  }

  getQuestion(questionId: string) {
    const question = this.db.prepare(`
      SELECT
        q.id,
        q.text,
        q.question_type AS questionType,
        q.difficulty,
        q.source_id AS sourceId,
        q.metadata_json AS metadataJson,
        d.title AS sourceTitle,
        d.rel_path AS sourceRelPath
      FROM questions q
      JOIN documents d ON d.id = q.document_id
      WHERE q.id = ?
    `).get(questionId) as
      | {
          difficulty: string
          id: string
          metadataJson: string
          questionType: string
          sourceId: string
          sourceRelPath: string
          sourceTitle: string
          text: string
        }
      | undefined

    if (!question) {
      return null
    }

    const guideMatches = this.db.prepare(`
      SELECT
        s.id,
        s.heading,
        s.anchor,
        s.level,
        s.content,
        s.start_line AS startLine,
        s.end_line AS endLine,
        l.score,
        d.id AS documentId,
        d.source_id AS documentSourceId,
        d.title AS documentTitle,
        d.path AS watchPath,
        d.rel_path AS relPath
      FROM links l
      JOIN sections s ON s.id = l.to_id
      JOIN documents d ON d.id = s.document_id
      WHERE l.from_id = ? AND l.relation = 'question_to_section'
      ORDER BY l.score DESC
    `).all(questionId)

    const guideFallbackMatches = this.db.prepare(`
      SELECT
        d.id AS documentId,
        d.source_id AS documentSourceId,
        d.title AS documentTitle,
        d.path AS watchPath,
        d.rel_path AS relPath,
        l.score,
        l.evidence_json AS evidenceJson
      FROM links l
      JOIN documents d ON d.id = l.to_id
      WHERE l.from_id = ? AND l.relation = 'question_to_document_fallback'
      ORDER BY l.score DESC
    `).all(questionId) as Array<{
      documentId: string
      documentSourceId: string
      documentTitle: string
      evidenceJson: string
      relPath: string
      score: number
      watchPath: string
    }>

    const workMatches = this.db.prepare(`
      SELECT
        d.id,
        d.source_id AS sourceId,
        d.title,
        d.path AS watchPath,
        d.rel_path AS relPath,
        l.score,
        d.meta_json AS metaJson,
        l.evidence_json AS evidenceJson
      FROM links l
      JOIN documents d ON d.id = l.to_id
      WHERE l.from_id = ? AND l.relation = 'question_to_work'
      ORDER BY l.score DESC
    `).all(questionId) as Array<{
      evidenceJson: string
      id: string
      metaJson: string
      sourceId: string
      relPath: string
      score: number
      title: string
      watchPath: string
    }>

    const workHintMatches = this.db.prepare(`
      SELECT
        d.id,
        d.source_id AS sourceId,
        d.title,
        d.path AS watchPath,
        d.rel_path AS relPath,
        l.score,
        d.meta_json AS metaJson,
        l.evidence_json AS evidenceJson
      FROM links l
      JOIN documents d ON d.id = l.to_id
      WHERE l.from_id = ? AND l.relation = 'question_to_work_hint'
      ORDER BY l.score DESC
    `).all(questionId) as Array<{
      evidenceJson: string
      id: string
      metaJson: string
      sourceId: string
      relPath: string
      score: number
      title: string
      watchPath: string
    }>

    const generated = this.getGeneratedAnswer(questionId)

    const { metadataJson, sourceRelPath, ...questionBase } = question
    const metadata = safeJson(metadataJson) as Record<string, unknown>
    const translatedText = readTranslatedText(metadata)

    return {
      ...questionBase,
      displayText: translatedText ?? questionBase.text,
      sourcePath: buildSourceReference(question.sourceId, sourceRelPath),
      metadata,
      translatedText,
      guideMatches: (guideMatches as Array<{
        anchor: string
        content: string
        documentId: string
        documentSourceId: string
        documentTitle: string
        endLine: number
        heading: string
        id: string
        level: number
        relPath: string
        score: number
        startLine: number
        watchPath: string
      }>).map(({ documentSourceId, watchPath: _watchPath, ...item }) => ({
        ...item,
        path: buildSourceReference(documentSourceId, item.relPath)
      })),
      guideFallbackMatches: guideFallbackMatches.map(({ documentSourceId, evidenceJson: _evidenceJson, watchPath: _watchPath, ...item }) => ({
        ...item,
        path: buildSourceReference(documentSourceId, item.relPath)
      })),
      workEvidenceStatus: workMatches.length > 0 ? 'direct' : workHintMatches.length > 0 ? 'adjacent' : 'none',
      workMatches: workMatches.map(({ evidenceJson, sourceId: itemSourceId, watchPath: _watchPath, ...item }) => ({
        ...item,
        path: buildSourceReference(itemSourceId, item.relPath),
        meta: {
          ...sanitizeDocumentMeta(safeJson(item.metaJson as string)),
          retrievalEvidence: safeJson(evidenceJson)
        }
      })),
      workHintMatches: workHintMatches.map(({ evidenceJson, sourceId: itemSourceId, watchPath: _watchPath, ...item }) => ({
        ...item,
        path: buildSourceReference(itemSourceId, item.relPath),
        meta: {
          ...sanitizeDocumentMeta(safeJson(item.metaJson as string)),
          retrievalEvidence: safeJson(evidenceJson)
        }
      })),
      generated
    }
  }

  listDocuments(kind = '', sourceId = '', limit = 400): DocumentListItem[] {
    const clauses: string[] = []
    const params: Record<string, unknown> = { limit }
    if (kind) {
      clauses.push('d.kind = @kind')
      params.kind = kind
    }
    if (sourceId) {
      clauses.push('d.source_id = @sourceId')
      params.sourceId = sourceId
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = this.db.prepare(`
      SELECT
        d.id,
        d.source_id AS sourceId,
        d.kind,
        d.title,
        d.path,
        d.rel_path AS relPath,
        d.ext,
        d.updated_at AS updatedAt,
        COUNT(DISTINCT CASE WHEN l.relation = 'question_to_section' THEN l.id END) AS knowledgeHitCount
      FROM documents d
      LEFT JOIN sections s
        ON s.document_id = d.id
      LEFT JOIN links l
        ON l.to_id = s.id
      ${where}
      GROUP BY d.id
      ORDER BY d.kind ASC, knowledgeHitCount DESC, d.title ASC
      LIMIT @limit
    `).all(params) as DocumentListItem[]

    return rows.map((item) => ({
      ...item,
      path: buildSourceReference(item.sourceId, item.relPath)
    }))
  }

  async getDocument(documentId: string) {
    const row = this.db.prepare(`
      SELECT
        id,
        source_id AS sourceId,
        kind,
        title,
        path,
        rel_path AS relPath,
        ext,
        content,
        meta_json AS metaJson,
        updated_at AS updatedAt
      FROM documents
      WHERE id = ?
    `).get(documentId) as
      | {
          content: string
          ext: string
          id: string
          kind: string
          metaJson: string
          path: string
          relPath: string
          sourceId: string
          title: string
          updatedAt: string
        }
      | undefined

    if (!row) {
      return null
    }

    const sectionQuestions = this.db.prepare(`
      SELECT
        s.anchor,
        s.order_index AS orderIndex,
        q.id AS questionId,
        q.text,
        q.metadata_json AS metadataJson,
        q.question_type AS questionType,
        q.difficulty,
        l.score,
        ga.status AS generatedStatus,
        ga.output_json AS generatedOutputJson
      FROM sections s
      JOIN links l
        ON l.to_id = s.id
       AND l.relation = 'question_to_section'
      JOIN questions q
        ON q.id = l.from_id
      LEFT JOIN generated_answers ga
        ON ga.question_id = q.id
      WHERE s.document_id = ?
      ORDER BY s.order_index ASC, l.score DESC, q.text ASC
    `).all(documentId) as SectionQuestionRow[]

    const looseQuestions = this.db.prepare(`
      SELECT
        q.id AS questionId,
        q.text,
        q.metadata_json AS metadataJson,
        q.question_type AS questionType,
        q.difficulty,
        l.score,
        ga.status AS generatedStatus,
        ga.output_json AS generatedOutputJson
      FROM links l
      JOIN questions q
        ON q.id = l.from_id
      LEFT JOIN generated_answers ga
        ON ga.question_id = q.id
      WHERE l.to_id = ? AND l.relation = 'question_to_document_fallback'
      ORDER BY l.score DESC, q.text ASC
    `).all(documentId) as LooseQuestionRow[]

    const firstOccurrenceByQuestionId = this.readFirstQuestionOccurrences([
      ...sectionQuestions.map((item) => item.questionId),
      ...looseQuestions.map((item) => item.questionId)
    ])
    const questionsByAnchor = new Map<string, Array<{
      difficulty: string
      displayText: string
      generated: JsonRecord | null
      generatedStatus: string | null
      id: string
      isRevisited: boolean
      questionType: string
      score: number
      text: string
      translatedText: string | null
    }>>()

    for (const item of sectionQuestions) {
      const bucket = questionsByAnchor.get(item.anchor) ?? []
      const metadata = safeJson(item.metadataJson) as Record<string, unknown>
      const translatedText = readTranslatedText(metadata)
      const candidate = {
        displayText: translatedText ?? item.text,
        id: item.questionId,
        isRevisited: hasQuestionAppearedEarlier(
          firstOccurrenceByQuestionId.get(item.questionId) ?? null,
          { orderIndex: item.orderIndex, relPath: row.relPath, sourceId: row.sourceId }
        ),
        text: item.text,
        translatedText,
        questionType: item.questionType,
        difficulty: item.difficulty,
        score: item.score,
        generatedStatus: item.generatedStatus,
        generated: item.generatedOutputJson ? safeObject(item.generatedOutputJson) : null
      }
      questionsByAnchor.set(item.anchor, upsertQuestionBucket(bucket, candidate))
    }

    const { path: filePath, metaJson, ...documentBase } = row
    const liveContent = await readLiveContent(filePath, row.content)
    const liveSections = splitIntoSections(documentBase.title, liveContent)
    const fallbackOrderIndex = liveSections.length + 1
    const looseRelatedQuestions = looseQuestions.map((item) => {
      const metadata = safeJson(item.metadataJson) as Record<string, unknown>
      const translatedText = readTranslatedText(metadata)
      return {
        displayText: translatedText ?? item.text,
        id: item.questionId,
        isRevisited: hasQuestionAppearedEarlier(
          firstOccurrenceByQuestionId.get(item.questionId) ?? null,
          { orderIndex: fallbackOrderIndex, relPath: row.relPath, sourceId: row.sourceId }
        ),
        text: item.text,
        translatedText,
        questionType: item.questionType,
        difficulty: item.difficulty,
        score: item.score,
        generatedStatus: item.generatedStatus,
        generated: item.generatedOutputJson ? safeObject(item.generatedOutputJson) : null
      }
    })

    return {
      ...documentBase,
      path: buildSourceReference(row.sourceId, row.relPath),
      watchPath: filePath,
      meta: sanitizeDocumentMeta(safeJson(metaJson)),
      content: liveContent,
      looseRelatedQuestions,
      sections: liveSections.map((section) => ({
        ...section,
        knowledgeHitCount: (questionsByAnchor.get(section.anchor) ?? []).length,
        relatedQuestions: questionsByAnchor.get(section.anchor) ?? []
      }))
    }
  }

  search(query: string) {
    const like = `%${query.trim()}%`
    const sections = this.db.prepare(`
      SELECT
        s.id,
        s.heading,
        s.content,
        d.id AS documentId,
        d.title AS documentTitle,
        d.rel_path AS relPath
      FROM sections s
      JOIN documents d ON d.id = s.document_id
      WHERE s.heading LIKE ? OR s.content LIKE ?
      LIMIT 12
    `).all(like, like)

    const questions = this.db.prepare(`
      SELECT id, text, metadata_json AS metadataJson
      FROM questions
      WHERE text LIKE ? OR metadata_json LIKE ?
      LIMIT 12
    `).all(like, like) as Array<{
      id: string
      metadataJson: string
      text: string
    }>

    return {
      sections,
      questions: questions.map(({ metadataJson, ...item }) => {
        const metadata = safeJson(metadataJson) as Record<string, unknown>
        const translatedText = readTranslatedText(metadata)
        return {
          ...item,
          displayText: translatedText ?? item.text,
          translatedText
        }
      })
    }
  }

  getGeneratedAnswer(questionId: string) {
    const row = this.db.prepare(`
      SELECT
        id,
        question_id AS questionId,
        model,
        reasoning_effort AS reasoningEffort,
        status,
        output_json AS outputJson,
        output_markdown AS outputMarkdown,
        citations_json AS citationsJson,
        updated_at AS updatedAt
      FROM generated_answers
      WHERE question_id = ?
    `).get(questionId) as
      | {
          citationsJson: string
          id: string
          model: string
          outputJson: string
          outputMarkdown: string
          questionId: string
          reasoningEffort: string
          status: string
          updatedAt: string
        }
      | undefined

    if (!row) {
      return null
    }

    return {
      ...row,
      output: safeJson(row.outputJson),
      citations: safeJson(row.citationsJson)
    }
  }

  upsertGeneratedAnswer(input: {
    citationsJson: string
    id: string
    model: string
    outputJson: string
    outputMarkdown: string
    questionId: string
    reasoningEffort: string
    status: string
    updatedAt: string
  }) {
    const statement = this.db.prepare(`
      INSERT INTO generated_answers (
        id, question_id, model, reasoning_effort, status, output_json, output_markdown, citations_json, updated_at
      ) VALUES (
        @id, @questionId, @model, @reasoningEffort, @status, @outputJson, @outputMarkdown, @citationsJson, @updatedAt
      )
      ON CONFLICT(question_id) DO UPDATE SET
        model = excluded.model,
        reasoning_effort = excluded.reasoning_effort,
        status = excluded.status,
        output_json = excluded.output_json,
        output_markdown = excluded.output_markdown,
        citations_json = excluded.citations_json,
        updated_at = excluded.updated_at
    `)

    statement.run(input)
  }

  getDocumentsByIds(documentIds: string[]) {
    if (documentIds.length === 0) {
      return []
    }
    const placeholders = documentIds.map(() => '?').join(', ')
    const rows = this.db.prepare(`
      SELECT
        id,
        source_id AS sourceId,
        kind,
        title,
        path,
        rel_path AS relPath,
        ext,
        content,
        meta_json AS metaJson
      FROM documents
      WHERE id IN (${placeholders})
    `).all(...documentIds) as Array<{
      content: string
      ext: string
      id: string
      kind: string
      metaJson: string
      path: string
      relPath: string
      sourceId: string
      title: string
    }>
    const byId = new Map(rows.map((item) => [item.id, item]))
    return documentIds
      .map((documentId) => byId.get(documentId))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({
        ...item,
        watchPath: item.path,
        path: buildSourceReference(item.sourceId, item.relPath),
        meta: safeJson(item.metaJson)
      }))
  }

  listWorkProjects() {
    const rows = this.db.prepare(`
      SELECT
        id,
        name,
        root_path AS rootPath,
        status,
        summary,
        meta_json AS metaJson
      FROM work_projects
      ORDER BY name ASC
    `).all() as WorkProjectRow[]
    return rows.map(({ metaJson, ...item }) => ({
      ...item,
      rootPath: buildProjectReference(item.name),
      meta: sanitizeWorkProjectMeta(safeJson(metaJson))
    }))
  }

  getWorkProject(projectId: string) {
    const project = this.db.prepare(`
      SELECT
        id,
        name,
        root_path AS rootPath,
        status,
        summary,
        meta_json AS metaJson
      FROM work_projects
      WHERE id = ?
    `).get(projectId) as WorkProjectRow | undefined

    if (!project) {
      return null
    }

    const documents = this.db.prepare(`
      SELECT
        id,
        source_id AS sourceId,
        title,
        path,
        rel_path AS relPath,
        ext,
        content,
        meta_json AS metaJson
      FROM documents
      WHERE kind = 'work'
      ORDER BY title ASC
    `).all() as Array<{
      content: string
      ext: string
      id: string
      metaJson: string
      path: string
      relPath: string
      sourceId: string
      title: string
    }>

    const projectDocuments = documents
      .map((item) => ({
        ...item,
        meta: safeJson(item.metaJson)
      }))
      .filter((item) => {
        const meta = item.meta as Record<string, unknown>
        return meta.project === project.name
      })
      .sort((left, right) => scoreProjectDoc(right) - scoreProjectDoc(left))

    const docIds = projectDocuments.map((item) => item.id)
    const relatedQuestions = docIds.length > 0
      ? this.db.prepare(`
          SELECT
            q.id,
            q.text,
            q.question_type AS questionType,
            q.difficulty,
            MAX(l.score) AS maxScore,
            ga.status AS generatedStatus
          FROM links l
          JOIN questions q ON q.id = l.from_id
          LEFT JOIN generated_answers ga ON ga.question_id = q.id
          WHERE l.relation = 'question_to_work'
            AND l.to_id IN (${docIds.map(() => '?').join(', ')})
          GROUP BY q.id
          ORDER BY maxScore DESC, q.text ASC
          LIMIT 10
        `).all(...docIds) as Array<{
          difficulty: string
          generatedStatus: string | null
          id: string
          maxScore: number
          questionType: string
          text: string
        }>
      : []

    const prep = buildProjectPrep({
      id: project.id,
      meta: safeJson(project.metaJson) as Record<string, unknown>,
      name: project.name,
      rootPath: buildProjectReference(project.name),
      status: project.status,
      summary: project.summary
    }, projectDocuments.map((item) => ({
      content: item.content,
      ext: item.ext,
      id: item.id,
      meta: item.meta as Record<string, unknown>,
      relPath: item.relPath,
      title: item.title
    })), relatedQuestions)

    return {
      id: project.id,
      name: project.name,
      rootPath: buildProjectReference(project.name),
      status: project.status,
      summary: project.summary,
      meta: sanitizeWorkProjectMeta(safeJson(project.metaJson)),
      documents: projectDocuments.map((item) => ({
        ext: item.ext,
        id: item.id,
        meta: sanitizeDocumentMeta(item.meta),
        path: buildSourceReference(item.sourceId, item.relPath),
        relPath: item.relPath,
        title: item.title
      })),
      prep,
      primaryDocumentId: projectDocuments[0]?.id ?? null
    }
  }

  private scalar<T>(query: string): T {
    const row = this.db.prepare(query).get() as { value: T }
    return row.value
  }

  private readAppMeta(key: string) {
    const row = this.db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? ''
  }

  private readFirstQuestionOccurrences(questionIds: string[]) {
    const uniqueIds = [...new Set(questionIds)]
    if (uniqueIds.length === 0) {
      return new Map<string, { orderIndex: number; relPath: string; sourceId: string }>()
    }

    const placeholders = uniqueIds.map(() => '?').join(', ')
    const rows = this.db.prepare(`
      SELECT
        l.from_id AS questionId,
        d.source_id AS sourceId,
        d.rel_path AS relPath,
        s.order_index AS orderIndex
      FROM links l
      JOIN sections s ON s.id = l.to_id
      JOIN documents d ON d.id = s.document_id
      WHERE l.relation = 'question_to_section'
        AND l.from_id IN (${placeholders})
      ORDER BY d.source_id ASC, d.rel_path ASC, s.order_index ASC, l.score DESC
    `).all(...uniqueIds) as Array<{
      orderIndex: number
      questionId: string
      relPath: string
      sourceId: string
    }>

    const firstByQuestionId = new Map<string, { orderIndex: number; relPath: string; sourceId: string }>()
    for (const row of rows) {
      if (!firstByQuestionId.has(row.questionId)) {
        firstByQuestionId.set(row.questionId, row)
      }
    }
    return firstByQuestionId
  }
}

function safeJson(input: string): JsonRecord | unknown[] {
  try {
    return JSON.parse(input)
  } catch {
    return {}
  }
}

function safeObject(input: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(input)
    return parsed && !Array.isArray(parsed) && typeof parsed === 'object' ? parsed as JsonRecord : null
  } catch {
    return null
  }
}

function readTranslatedText(metadata: Record<string, unknown>) {
  const translatedText = metadata.translatedText
  return typeof translatedText === 'string' && translatedText.trim()
    ? translatedText.trim()
    : null
}

function readNullableMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null
}

function readPrimaryCategory(metadata: Record<string, unknown>) {
  const id = readNullableMetadataString(metadata, 'primaryCategory') ?? 'project-deep-dive'
  const label = readNullableMetadataString(metadata, 'primaryCategoryLabel') ?? '项目深挖'
  const rawOrder = metadata.primaryCategoryOrder
  const order = typeof rawOrder === 'number' && Number.isFinite(rawOrder) ? rawOrder : 99

  return { id, label, order }
}

function upsertQuestionBucket(
  bucket: Array<{
    difficulty: string
    displayText: string
    generated: JsonRecord | null
    generatedStatus: string | null
    id: string
    isRevisited: boolean
    questionType: string
    score: number
    text: string
    translatedText: string | null
  }>,
  candidate: {
    difficulty: string
    displayText: string
    generated: JsonRecord | null
    generatedStatus: string | null
    id: string
    isRevisited: boolean
    questionType: string
    score: number
    text: string
    translatedText: string | null
  }
) {
  const fingerprint = buildQuestionFingerprint(candidate.text)
  const existingIndex = bucket.findIndex((item) => buildQuestionFingerprint(item.text) === fingerprint)

  if (existingIndex === -1) {
    return [...bucket, candidate]
  }

  const existing = bucket[existingIndex]
  const shouldReplace = candidate.score > existing.score
    || (candidate.generatedStatus === 'ready' && existing.generatedStatus !== 'ready')

  if (!shouldReplace) {
    return bucket
  }

  const next = [...bucket]
  next[existingIndex] = candidate
  return next
}

function buildQuestionFingerprint(text: string) {
  const tokens = text
    .toLowerCase()
    .replace(/^[\s📌✅⭐❓🔥👉]+/u, '')
    .replace(/^q\s*\d+\s*[:：.\-]\s*/i, '')
    .replace(/^\|\s*q\s*\d+\s*\|\s*/i, '')
    .replace(/\|\s*\[answer\]\([^)]*\)\s*\|?/ig, '')
    .replace(/\btransformer model\b/g, 'transformer')
    .replace(/\btransformers\b/g, 'transformer')
    .replace(/\bmodels\b/g, 'model')
    .replace(/\bllms\b/g, 'llm')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .split(/\s+/)
    .map((token) => normalizeQuestionFingerprintToken(token))
    .filter((token) => token && !QUESTION_FINGERPRINT_STOPWORDS.has(token))

  return [...new Set(tokens)]
    .sort((left, right) => left.localeCompare(right, 'en'))
    .join(' ')
    .trim()
}

function normalizeQuestionFingerprintToken(token: string) {
  if (!token || !/^[a-z0-9]+$/.test(token)) {
    return token
  }

  if (token.length >= 7 && token.endsWith('ing')) {
    return token.slice(0, -3)
  }
  if (token.length >= 6 && token.endsWith('ied')) {
    return `${token.slice(0, -3)}y`
  }
  if (token.length >= 6 && token.endsWith('ed')) {
    return token.slice(0, -2)
  }
  if (token.length >= 6 && token.endsWith('es')) {
    return token.slice(0, -2)
  }
  if (token.length >= 5 && token.endsWith('s')) {
    return token.slice(0, -1)
  }

  return token
}

function hasQuestionAppearedEarlier(
  firstOccurrence: { orderIndex: number; relPath: string; sourceId: string } | null,
  currentLocation: { orderIndex: number; relPath: string; sourceId: string }
) {
  if (!firstOccurrence) {
    return false
  }

  return compareQuestionOccurrenceLocation(firstOccurrence, currentLocation) < 0
}

function compareQuestionOccurrenceLocation(
  left: { orderIndex: number; relPath: string; sourceId: string },
  right: { orderIndex: number; relPath: string; sourceId: string }
) {
  return left.sourceId.localeCompare(right.sourceId, 'en')
    || left.relPath.localeCompare(right.relPath, 'en')
    || left.orderIndex - right.orderIndex
}

function scoreProjectDoc(item: {
  ext: string
  meta: JsonRecord | unknown[]
  relPath: string
  title: string
}) {
  const meta = item.meta as Record<string, unknown>
  const originKind = typeof meta.originKind === 'string' ? meta.originKind : ''
  let score = 0
  if (originKind === 'primary') {
    score += 3
  }
  if (/readme|总览|overview|导读|index/i.test(`${item.title}\n${item.relPath}`)) {
    score += 3
  }
  if (['md', 'mdx', 'markdown'].includes(item.ext)) {
    score += 2
  } else if (item.ext === 'ipynb') {
    score += 1
  }
  return score
}

function normalizePublicPath(relPath: string) {
  return relPath.replaceAll('\\', '/')
}

function buildSourceReference(sourceId: string, relPath: string) {
  return `${sourceId}://${normalizePublicPath(relPath)}`
}

function buildProjectReference(projectName: string) {
  return `project://${normalizePublicPath(projectName)}`
}

function sanitizeDocumentMeta(meta: JsonRecord | unknown[]) {
  if (Array.isArray(meta)) {
    return meta
  }

  const sanitized = { ...meta }
  delete sanitized.originPath
  return sanitized
}

function sanitizeWorkProjectMeta(meta: JsonRecord | unknown[]) {
  if (Array.isArray(meta)) {
    return {}
  }

  const sources = Array.isArray(meta.sources)
    ? meta.sources.map((source) => {
        const item = source as Record<string, unknown>
        return {
          kind: item.kind,
          status: item.status,
          fileCount: Array.isArray(item.files) ? item.files.length : 0
        }
      })
    : []

  return {
    fileCount: meta.fileCount,
    interviewRelevance: meta.interviewRelevance,
    manifestNotes: meta.manifestNotes,
    sources
  }
}
