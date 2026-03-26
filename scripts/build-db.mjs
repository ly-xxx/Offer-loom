import fs from 'node:fs/promises'
import path from 'node:path'

import Database from 'better-sqlite3'

import {
  DB_PATH,
  collectGuideFiles,
  collectWorkRootFiles,
  buildQuestionCanonicalText,
  ensureDir,
  extractQuestions,
  hashContent,
  inspectWorkProjectSpec,
  normalizeDocument,
  nowIso,
  pathExists,
  readConfig,
  readTextFile,
  readWorkManifest,
  resolveSourcePath,
  resolveWorkProjectSpecs,
  splitIntoSections,
  tokenizeText
} from './lib.mjs'
import {
  cosineSimilarity,
  embedTexts,
  getEmbeddingModelId
} from './embeddings.mjs'
import {
  findQuestionTranslation,
  loadQuestionTranslationCache
} from './translation-cache.mjs'

const QUESTION_FINGERPRINT_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'between', 'does', 'difference', 'different', 'do', 'explain', 'how',
  'during', 'e', 'eg', 'example', 'for', 'g', 'in', 'is', 'it', 'its', 'of', 'the', 'their',
  'them', 'to', 'used', 'what', 'where', 'why'
])

async function main() {
  await ensureDir(path.dirname(DB_PATH))
  await fs.rm(DB_PATH, { force: true })

  const db = new Database(DB_PATH)
  initSchema(db)
  emitProgress('sources', 0.06, '读取主线指南与题库来源')

  const config = await readConfig()
  const sources = [...config.guides, ...config.questionBanks]
  const translationCache = await loadQuestionTranslationCache()

  const insertDocument = db.prepare(`
    INSERT INTO documents (
      id, source_id, kind, title, path, rel_path, ext, content, meta_json, content_hash, updated_at
    ) VALUES (
      @id, @sourceId, @kind, @title, @path, @relPath, @ext, @content, @metaJson, @contentHash, @updatedAt
    )
  `)
  const insertSection = db.prepare(`
    INSERT INTO sections (
      id, document_id, source_id, kind, heading, anchor, level, order_index, start_line, end_line, content
    ) VALUES (
      @id, @documentId, @sourceId, @kind, @heading, @anchor, @level, @orderIndex, @startLine, @endLine, @content
    )
  `)
  const insertSectionFts = db.prepare(`
    INSERT INTO sections_fts (section_id, heading, content, source_id, kind)
    VALUES (@sectionId, @heading, @content, @sourceId, @kind)
  `)
  const insertQuestion = db.prepare(`
    INSERT INTO questions (
      id, source_id, document_id, text, canonical_text, question_type, difficulty, tags_json, metadata_json
    ) VALUES (
      @id, @sourceId, @documentId, @text, @canonicalText, @questionType, @difficulty, @tagsJson, @metadataJson
    )
  `)
  const insertQuestionFts = db.prepare(`
    INSERT INTO questions_fts (question_id, text)
    VALUES (@questionId, @text)
  `)
  const insertWorkChunk = db.prepare(`
    INSERT INTO work_chunks (
      id, document_id, project, heading, order_index, start_line, end_line, content, context_text
    ) VALUES (
      @id, @documentId, @project, @heading, @orderIndex, @startLine, @endLine, @content, @contextText
    )
  `)
  const insertWorkChunkFts = db.prepare(`
    INSERT INTO work_chunks_fts (chunk_id, heading, content, context_text, project)
    VALUES (@chunkId, @heading, @content, @contextText, @project)
  `)
  const insertLink = db.prepare(`
    INSERT INTO links (
      from_type, from_id, to_type, to_id, relation, score, evidence_json
    ) VALUES (
      @fromType, @fromId, @toType, @toId, @relation, @score, @evidenceJson
    )
  `)
  const insertSource = db.prepare(`
    INSERT INTO sources (id, kind, type, root_path, meta_json)
    VALUES (@id, @kind, @type, @rootPath, @metaJson)
  `)
  const insertWorkProject = db.prepare(`
    INSERT INTO work_projects (id, name, root_path, status, summary, meta_json)
    VALUES (@id, @name, @rootPath, @status, @summary, @metaJson)
  `)
  const insertAppMeta = db.prepare(`
    INSERT INTO app_meta (key, value)
    VALUES (@key, @value)
  `)

  const guideSections = []
  const guideDocuments = []
  const workDocuments = []
  const workChunks = []
  let translatedQuestionCount = 0
  const seenQuestionCanonicals = new Set()
  const seenQuestionFingerprints = new Set()
  const seenQuestionFingerprintList = []

  for (const source of sources) {
    const rootPath = resolveSourcePath(source)
    insertSource.run({
      id: source.id,
      kind: source.kind,
      type: source.type,
      rootPath,
      metaJson: JSON.stringify(source)
    })

    if (!(await pathExists(rootPath))) {
      continue
    }

    const files = await collectGuideFiles(rootPath)
    for (const filePath of files) {
      const rawContent = await readTextFile(filePath)
      const normalized = normalizeDocument(filePath, rawContent)
      if (!normalized.content) {
        continue
      }

      const relPath = path.relative(rootPath, filePath)
      const documentId = hashContent(`${source.id}:${relPath}`)
      insertDocument.run({
        id: documentId,
        sourceId: source.id,
        kind: source.kind,
        title: normalized.title,
        path: filePath,
        relPath,
        ext: path.extname(filePath).slice(1),
        content: normalized.content,
        metaJson: JSON.stringify(normalized.frontmatter),
        contentHash: hashContent(normalized.content),
        updatedAt: nowIso()
      })

      const sections = splitIntoSections(normalized.title, normalized.content)
      if (source.kind === 'guide') {
        guideDocuments.push({
          documentId,
          documentTitle: normalized.title,
          relPath,
          sourceId: source.id,
          summaryText: [
            normalized.title,
            relPath,
            sections.slice(0, 8).map((section) => section.heading).join('\n'),
            sections.slice(0, 3).map((section) => section.content.slice(0, 420)).join('\n\n')
          ].join('\n')
        })
      }

      sections.forEach((section, index) => {
        const sectionId = hashContent(`${documentId}:${index}:${section.anchor}`)
        insertSection.run({
          id: sectionId,
          documentId,
          sourceId: source.id,
          kind: source.kind,
          heading: section.heading,
          anchor: section.anchor,
          level: section.level,
          orderIndex: index,
          startLine: section.startLine,
          endLine: section.endLine,
          content: section.content
        })
        insertSectionFts.run({
          sectionId,
          heading: section.heading,
          content: section.content,
          sourceId: source.id,
          kind: source.kind
        })

        if (source.kind === 'guide') {
          guideSections.push({
            documentId,
            id: sectionId,
            documentTitle: normalized.title,
            relPath,
            sourceId: source.id,
            heading: section.heading,
            content: section.content
          })
        }
      })

      if (source.kind === 'question_bank') {
        const questions = extractQuestions(normalized.title, normalized.content)
        questions.forEach((question, index) => {
          const questionId = hashContent(`${documentId}:question:${index}:${question.text}`)
          const translation = findQuestionTranslation(translationCache, questionId, question.text)
          const canonicalText = buildQuestionCanonicalText(question.text)
          const questionFingerprint = buildQuestionFingerprint(question.text)
          const translatedFingerprint = translation?.translatedText
            ? buildQuestionFingerprint(translation.translatedText)
            : ''
          if (
            !canonicalText
            || seenQuestionCanonicals.has(canonicalText)
            || (questionFingerprint && seenQuestionFingerprints.has(questionFingerprint))
            || (translatedFingerprint && seenQuestionFingerprints.has(translatedFingerprint))
            || (questionFingerprint && seenQuestionFingerprintList.some((item) => areQuestionFingerprintsNearDuplicate(item, questionFingerprint)))
            || (translatedFingerprint && seenQuestionFingerprintList.some((item) => areQuestionFingerprintsNearDuplicate(item, translatedFingerprint)))
          ) {
            return
          }
          seenQuestionCanonicals.add(canonicalText)
          if (questionFingerprint) {
            seenQuestionFingerprints.add(questionFingerprint)
            seenQuestionFingerprintList.push(questionFingerprint)
          }
          if (translatedFingerprint) {
            seenQuestionFingerprints.add(translatedFingerprint)
            seenQuestionFingerprintList.push(translatedFingerprint)
          }
          const classification = classifyInterviewQuestion({
            documentTitle: normalized.title,
            frontmatter: normalized.frontmatter,
            questionText: question.text,
            relPath,
            sourceId: source.id
          })
          const metadata = {
            company: readOptionalFrontmatterString(normalized.frontmatter, 'company'),
            importMethod: readOptionalFrontmatterString(normalized.frontmatter, 'importMethod'),
            importOrigin: readOptionalFrontmatterString(normalized.frontmatter, 'importOrigin'),
            interviewDate: readOptionalFrontmatterString(normalized.frontmatter, 'interviewDate'),
            interviewFacet: classification.interviewFacet,
            primaryCategory: classification.primary.id,
            primaryCategoryLabel: classification.primary.label,
            primaryCategoryOrder: classification.primary.order,
            role: readOptionalFrontmatterString(normalized.frontmatter, 'role'),
            secondaryCategories: classification.secondary,
            sourceHint: question.sourceHint,
            sourceRelPath: relPath,
            sourceTitle: normalized.title,
            ...(translation
              ? {
                  translatedText: translation.translatedText,
                  translationModel: translation.model,
                  translationStatus: translation.status,
                  translationUpdatedAt: translation.updatedAt
                }
              : {})
          }

          if (translation?.translatedText) {
            translatedQuestionCount += 1
          }

          insertQuestion.run({
            id: questionId,
            sourceId: source.id,
            documentId,
            text: question.text,
            canonicalText,
            questionType: inferQuestionType(question.text),
            difficulty: inferDifficulty(question.text),
            tagsJson: JSON.stringify(classification.secondary.map((item) => item.id)),
            metadataJson: JSON.stringify(metadata)
          })
          insertQuestionFts.run({
            questionId,
            text: translation?.translatedText
              ? `${question.text}\n${translation.translatedText}`
              : question.text
          })
        })
      }
    }
  }

  const workRoot = resolveSourcePath(config.myWork)
  insertSource.run({
    id: config.myWork.id,
    kind: config.myWork.kind,
    type: config.myWork.type,
    rootPath: workRoot,
    metaJson: JSON.stringify(config.myWork)
  })

  const workManifest = await readWorkManifest(config)
  const workRootFiles = await collectWorkRootFiles(workRoot)
  const workProjectSpecs = await resolveWorkProjectSpecs(config, workManifest)
  let indexedWorkProjectCount = 0
  emitProgress('mywork_scan', 0.24, `扫描 mywork 语料，共发现 ${workProjectSpecs.length} 个候选项目`)

  for (const filePath of workRootFiles) {
    const rawContent = await readTextFile(filePath)
    const normalized = normalizeDocument(filePath, rawContent)
    if (!normalized.content) {
      continue
    }

    const relPath = path.relative(workRoot, filePath)
    const documentId = hashContent(`work-root:${relPath}`)
    insertDocument.run({
      id: documentId,
      sourceId: config.myWork.id,
      kind: 'work',
      title: `mywork / ${normalized.title}`,
      path: filePath,
      relPath: path.join('_overview', relPath),
      ext: path.extname(filePath).slice(1),
      content: normalized.content,
      metaJson: JSON.stringify({
        project: '_overview',
        originKind: 'work_root',
        originPath: workRoot,
        ...normalized.frontmatter
      }),
      contentHash: hashContent(normalized.content),
      updatedAt: nowIso()
    })

    const workDocument = {
      id: documentId,
      title: `mywork / ${normalized.title}`,
      content: normalized.content,
      ext: path.extname(filePath).slice(1),
      originKind: 'work_root',
      project: '_overview',
      relPath: path.join('_overview', relPath)
    }
    workDocuments.push(workDocument)
    registerWorkChunks(
      workDocument,
      insertWorkChunk,
      insertWorkChunkFts,
      workChunks
    )
  }

  for (const project of workProjectSpecs) {
    const inspection = await inspectWorkProjectSpec(project)
    const projectId = hashContent(`work:${project.name}`)
    const projectDocumentsToInsert = []
    const seenFiles = new Set()
    for (const fileEntry of inspection.files) {
      if (seenFiles.has(fileEntry.filePath)) {
        continue
      }
      seenFiles.add(fileEntry.filePath)

      const rawContent = await readTextFile(fileEntry.filePath)
      const normalized = normalizeDocument(fileEntry.filePath, rawContent)
      if (!normalized.content) {
        continue
      }

      const relPath = path.relative(fileEntry.originPath, fileEntry.filePath)
      const documentId = hashContent(`${projectId}:${fileEntry.originPath}:${relPath}`)
      projectDocumentsToInsert.push({
        id: documentId,
        sourceId: config.myWork.id,
        kind: 'work',
        title: `${project.name} / ${normalized.title}`,
        path: fileEntry.filePath,
        relPath: fileEntry.originKind === 'primary'
          ? path.join(project.name, relPath)
          : path.join(project.name, '_supplemental', path.basename(fileEntry.originPath), relPath),
        ext: path.extname(fileEntry.filePath).slice(1),
        content: normalized.content,
        metaJson: JSON.stringify({
          project: project.name,
          originKind: fileEntry.originKind,
          originPath: fileEntry.originPath,
          manifestNotes: inspection.manifestNotes,
          ...normalized.frontmatter
        }),
        contentHash: hashContent(normalized.content),
        updatedAt: nowIso()
      })
    }

    const relevance = scoreProjectInterviewRelevance(project.name, projectDocumentsToInsert)
    const finalStatus = normalizeWorkProjectStatus(inspection.status, relevance, projectDocumentsToInsert.length)
    if (finalStatus === 'indexed' || finalStatus === 'indexed_via_fallback') {
      indexedWorkProjectCount += 1
    }

    insertWorkProject.run({
      id: projectId,
      name: project.name,
      rootPath: project.primaryPath,
      status: finalStatus,
      summary: summarizeWorkProjectInspection(finalStatus, projectDocumentsToInsert.length, relevance),
      metaJson: JSON.stringify({
        fileCount: projectDocumentsToInsert.length,
        interviewRelevance: relevance,
        manifestNotes: inspection.manifestNotes,
        sources: inspection.sources
      })
    })

    if (!['indexed', 'indexed_via_fallback'].includes(finalStatus)) {
      continue
    }

    for (const document of projectDocumentsToInsert) {
      insertDocument.run(document)
      const parsedMeta = safeObjectJson(document.metaJson)

      const workDocument = {
        id: document.id,
        title: document.title,
        content: document.content,
        ext: document.ext,
        originKind: parsedMeta.originKind ?? 'primary',
        project: project.name,
        relPath: document.relPath
      }
      workDocuments.push(workDocument)
      registerWorkChunks(
        workDocument,
        insertWorkChunk,
        insertWorkChunkFts,
        workChunks
      )
    }
  }

  const questions = db.prepare(`
    SELECT id, text
    FROM questions
    ORDER BY text
  `).all()

  const guideTokenStats = buildTokenStats(guideSections.map((section) => buildGuideSearchText(section)))
  const guideDocumentTokenStats = buildTokenStats(guideDocuments.map((document) => buildGuideDocumentSearchText(document)))
  const workTokenStats = buildTokenStats(workDocuments.map((document) => buildWorkSearchText(document)))
  const workChunkTokenStats = buildTokenStats(workChunks.map((chunk) => buildWorkChunkSearchText(chunk)))
  emitProgress('embedding_prepare', 0.46, `准备检索索引：${guideSections.length} 个知识锚点，${guideDocuments.length} 篇主线文档，${workDocuments.length} 份工作文档，${workChunks.length} 个工作 chunk`)

  let retrievalMode = 'lexical'
  let embeddingError = ''
  let questionEmbeddings = []
  let guideEmbeddings = []
  let guideDocumentEmbeddings = []
  let workEmbeddings = []
  let workChunkEmbeddings = []

  if (process.env.OFFERLOOM_DISABLE_EMBEDDINGS !== '1') {
    try {
      emitProgress('embedding_run', 0.58, '构建语义检索向量与分层索引')
      questionEmbeddings = await embedTexts(questions.map((question) => question.text))
      guideEmbeddings = await embedTexts(guideSections.map((section) => buildGuideEmbeddingText(section)))
      guideDocumentEmbeddings = await embedTexts(guideDocuments.map((document) => buildGuideDocumentEmbeddingText(document)))
      workEmbeddings = await embedTexts(workDocuments.map((document) => buildWorkEmbeddingText(document)))
      workChunkEmbeddings = await embedTexts(workChunks.map((chunk) => buildWorkChunkEmbeddingText(chunk)))
      retrievalMode = 'hybrid_hierarchical_semantic'
    } catch (error) {
      embeddingError = error instanceof Error ? error.message : String(error)
      retrievalMode = 'lexical_hierarchical_fallback'
      questionEmbeddings = []
      guideEmbeddings = []
      guideDocumentEmbeddings = []
      workEmbeddings = []
      workChunkEmbeddings = []
    }
  }

  insertAppMeta.run({ key: 'retrieval_mode', value: retrievalMode })
  insertAppMeta.run({ key: 'embedding_model', value: retrievalMode.startsWith('hybrid') ? getEmbeddingModelId() : '' })
  insertAppMeta.run({ key: 'embedding_error', value: embeddingError })
  insertAppMeta.run({
    key: 'work_index_summary',
    value: JSON.stringify({
      total: workProjectSpecs.length,
      indexed: indexedWorkProjectCount
    })
  })
  insertAppMeta.run({
    key: 'translated_question_count',
    value: String(translatedQuestionCount)
  })
  emitProgress('linking', 0.74, `开始关联 ${questions.length} 道题与主线知识、项目材料`)

  for (const [questionIndex, question] of questions.entries()) {
    const bestGuideLinks = guideSections
      .map((section, sectionIndex) => {
        const lexicalScore = scoreWithTokenStats(
          question.text,
          section.content,
          `${section.documentTitle}\n${section.heading}`,
          guideTokenStats,
          guideSections.length
        )
        const semanticScore = questionEmbeddings.length > 0 && guideEmbeddings.length > 0
          ? cosineSimilarity(questionEmbeddings[questionIndex], guideEmbeddings[sectionIndex])
          : 0
        const headingMatchScore = scoreHeadingMatch(question.text, `${section.documentTitle}\n${section.heading}`)
        const softMatchScore = scoreSoftOverlap(
          question.text,
          `${section.documentTitle}\n${section.heading}\n${section.content.slice(0, 1200)}`
        )
        const topicScore = scoreTopicAlignment(question.text, `${section.heading}\n${section.content}`)
        const intentScore = scoreIntentAlignment(question.text, `${section.documentTitle}\n${section.heading}\n${section.content}`)
        const score = retrievalMode.startsWith('hybrid')
          ? Number((
              semanticScore * 0.38
              + lexicalScore * 0.18
              + headingMatchScore * 0.08
              + softMatchScore * 0.08
              + topicScore * 0.1
              + intentScore * 0.18
            ).toFixed(4))
          : lexicalScore
        return {
          ...section,
          headingMatchScore,
          intentScore,
          lexicalScore,
          semanticScore,
          softMatchScore,
          topicScore,
          score
        }
      })
      .filter((item) => shouldKeepGuideLink(question.text, item, retrievalMode))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)

    bestGuideLinks.forEach((match) => {
      insertLink.run({
        fromType: 'question',
        fromId: question.id,
        toType: 'section',
        toId: match.id,
        relation: 'question_to_section',
        score: match.score,
        evidenceJson: JSON.stringify({
          documentTitle: match.documentTitle,
          heading: match.heading,
          headingMatchScore: match.headingMatchScore,
          intentScore: match.intentScore,
          lexicalScore: match.lexicalScore,
          semanticScore: match.semanticScore,
          softMatchScore: match.softMatchScore,
          topicScore: match.topicScore,
          retrievalMode
        })
      })
    })

    const matchedGuideDocumentIds = new Set(bestGuideLinks.map((item) => item.documentId))
    const guideDocumentFallbacks = guideDocuments
      .map((document, documentIndex) => {
        const searchText = buildGuideDocumentSearchText(document)
        const lexicalScore = scoreWithTokenStats(
          question.text,
          document.summaryText,
          `${document.documentTitle}\n${document.relPath}`,
          guideDocumentTokenStats,
          guideDocuments.length
        )
        const semanticScore = questionEmbeddings.length > 0 && guideDocumentEmbeddings.length > 0
          ? cosineSimilarity(questionEmbeddings[questionIndex], guideDocumentEmbeddings[documentIndex])
          : 0
        const headingMatchScore = scoreHeadingMatch(question.text, `${document.documentTitle}\n${document.relPath}`)
        const softMatchScore = scoreSoftOverlap(question.text, searchText)
        const topicScore = scoreTopicAlignment(question.text, searchText)
        const intentScore = scoreIntentAlignment(question.text, searchText)
        const score = retrievalMode.startsWith('hybrid')
          ? Number((
              semanticScore * 0.34
              + lexicalScore * 0.16
              + headingMatchScore * 0.08
              + softMatchScore * 0.08
              + topicScore * 0.18
              + intentScore * 0.16
            ).toFixed(4))
          : Number((
              lexicalScore * 0.64
              + softMatchScore * 0.12
              + topicScore * 0.12
              + intentScore * 0.12
            ).toFixed(4))

        return {
          ...document,
          headingMatchScore,
          intentScore,
          lexicalScore,
          score,
          semanticScore,
          softMatchScore,
          topicScore
        }
      })
      .filter((item) => !matchedGuideDocumentIds.has(item.documentId))
      .filter((item) => shouldKeepGuideDocumentFallback(question.text, item, retrievalMode))
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)

    guideDocumentFallbacks.forEach((match) => {
      insertLink.run({
        fromType: 'question',
        fromId: question.id,
        toType: 'document',
        toId: match.documentId,
        relation: 'question_to_document_fallback',
        score: match.score,
        evidenceJson: JSON.stringify({
          documentTitle: match.documentTitle,
          headingMatchScore: match.headingMatchScore,
          intentScore: match.intentScore,
          lexicalScore: match.lexicalScore,
          relPath: match.relPath,
          semanticScore: match.semanticScore,
          softMatchScore: match.softMatchScore,
          topicScore: match.topicScore,
          retrievalMode
        })
      })
    })

    const workDocumentCandidates = workDocuments
      .map((document, documentIndex) => {
        const workScoreText = buildWorkScoringText(document)
        const lexicalScore = scoreWithTokenStats(
          question.text,
          document.content,
          `${document.title}\n${document.relPath}`,
          workTokenStats,
          workDocuments.length
        )
        const semanticScore = questionEmbeddings.length > 0 && workEmbeddings.length > 0
          ? cosineSimilarity(questionEmbeddings[questionIndex], workEmbeddings[documentIndex])
          : 0
        const headingMatchScore = scoreHeadingMatch(question.text, `${document.title}\n${document.relPath}`)
        const softMatchScore = scoreSoftOverlap(question.text, buildWorkScoringText(document, 1200))
        const topicScore = scoreTopicAlignment(question.text, workScoreText)
        const intentScore = scoreIntentAlignment(question.text, workScoreText)
        const domainScore = scoreDomainCompatibility(question.text, workScoreText)
        const groundingScore = scoreWorkGrounding(question.text, document, domainScore)
        const score = retrievalMode.startsWith('hybrid')
          ? Number((
              semanticScore * 0.24
              + lexicalScore * 0.12
              + headingMatchScore * 0.05
              + softMatchScore * 0.07
              + topicScore * 0.12
              + intentScore * 0.1
              + groundingScore * 0.16
              + domainScore
            ).toFixed(4))
          : Number((
              lexicalScore * 0.72
              + softMatchScore * 0.08
              + topicScore * 0.08
              + groundingScore * 0.04
              + domainScore * 0.18
            ).toFixed(4))
        return {
          ...document,
          domainScore,
          headingMatchScore,
          groundingScore,
          intentScore,
          lexicalScore,
          semanticScore,
          softMatchScore,
          topicScore,
          score
        }
      })
      .sort((a, b) => b.score - a.score)

    const bestWorkChunkLinks = workChunks
      .map((chunk, chunkIndex) => {
        const chunkScoreText = buildWorkChunkScoringText(chunk)
        const lexicalScore = scoreWithTokenStats(
          question.text,
          chunk.content,
          `${chunk.documentTitle}\n${chunk.heading}\n${chunk.relPath}`,
          workChunkTokenStats,
          workChunks.length
        )
        const semanticScore = questionEmbeddings.length > 0 && workChunkEmbeddings.length > 0
          ? cosineSimilarity(questionEmbeddings[questionIndex], workChunkEmbeddings[chunkIndex])
          : 0
        const headingMatchScore = scoreHeadingMatch(question.text, `${chunk.documentTitle}\n${chunk.heading}`)
        const softMatchScore = scoreSoftOverlap(question.text, chunkScoreText)
        const topicScore = scoreTopicAlignment(question.text, chunkScoreText)
        const intentScore = scoreIntentAlignment(question.text, chunkScoreText)
        const domainScore = scoreDomainCompatibility(question.text, chunkScoreText)
        const groundingScore = scoreWorkChunkGrounding(question.text, chunk, domainScore)
        const score = retrievalMode.startsWith('hybrid')
          ? Number((
              semanticScore * 0.28
              + lexicalScore * 0.14
              + headingMatchScore * 0.08
              + softMatchScore * 0.08
              + topicScore * 0.12
              + intentScore * 0.1
              + groundingScore * 0.16
              + domainScore * 0.12
            ).toFixed(4))
          : Number((
              lexicalScore * 0.66
              + softMatchScore * 0.08
              + topicScore * 0.1
              + groundingScore * 0.1
              + domainScore * 0.16
            ).toFixed(4))
        return {
          ...chunk,
          domainScore,
          groundingScore,
          headingMatchScore,
          intentScore,
          lexicalScore,
          semanticScore,
          softMatchScore,
          topicScore,
          score
        }
      })
      .filter((item) => shouldKeepWorkChunkLink(question.text, item, retrievalMode))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)

    bestWorkChunkLinks.forEach((match) => {
      insertLink.run({
        fromType: 'question',
        fromId: question.id,
        toType: 'work_chunk',
        toId: match.id,
        relation: 'question_to_work_chunk',
        score: match.score,
        evidenceJson: JSON.stringify({
          documentId: match.documentId,
          documentTitle: match.documentTitle,
          heading: match.heading,
          relPath: match.relPath,
          startLine: match.startLine,
          endLine: match.endLine,
          domainScore: match.domainScore,
          groundingScore: match.groundingScore,
          headingMatchScore: match.headingMatchScore,
          intentScore: match.intentScore,
          lexicalScore: match.lexicalScore,
          semanticScore: match.semanticScore,
          softMatchScore: match.softMatchScore,
          topicScore: match.topicScore,
          retrievalMode
        })
      })
    })

    const mergedWorkCandidates = mergeWorkCandidates(
      question.text,
      workDocumentCandidates,
      bestWorkChunkLinks
    )
      .filter((item) => shouldKeepMergedWorkLink(question.text, item, retrievalMode))
      .sort((a, b) => b.score - a.score)

    const bestWorkLinks = selectWorkLinks(question.text, mergedWorkCandidates).slice(0, 4)

    bestWorkLinks.forEach((match) => {
      insertLink.run({
        fromType: 'question',
        fromId: question.id,
        toType: 'document',
        toId: match.id,
        relation: 'question_to_work',
        score: match.score,
        evidenceJson: JSON.stringify({
          title: match.title,
          domainScore: match.domainScore,
          headingMatchScore: match.headingMatchScore,
          groundingScore: match.groundingScore,
          intentScore: match.intentScore,
          lexicalScore: match.lexicalScore,
          semanticScore: match.semanticScore,
          softMatchScore: match.softMatchScore,
          topicScore: match.topicScore,
          chunkAggregateScore: match.chunkAggregateScore ?? 0,
          chunkEvidence: match.chunkEvidence ?? [],
          retrievalMode
        })
      })
    })

    const bestWorkHints = selectWorkHintLinks(question.text, mergedWorkCandidates, bestWorkLinks)
    bestWorkHints.forEach((match) => {
      insertLink.run({
        fromType: 'question',
        fromId: question.id,
        toType: 'document',
        toId: match.id,
        relation: 'question_to_work_hint',
        score: match.score,
        evidenceJson: JSON.stringify({
          title: match.title,
          domainScore: match.domainScore,
          headingMatchScore: match.headingMatchScore,
          groundingScore: match.groundingScore,
          intentScore: match.intentScore,
          lexicalScore: match.lexicalScore,
          semanticScore: match.semanticScore,
          softMatchScore: match.softMatchScore,
          topicScore: match.topicScore,
          chunkAggregateScore: match.chunkAggregateScore ?? 0,
          chunkEvidence: match.chunkEvidence ?? [],
          retrievalMode
        })
      })
    })
  }

  emitProgress('finalize', 0.96, '收尾写入数据库并压缩索引文件')
  db.exec('VACUUM')
  db.close()
  emitProgress('done', 1, '索引构建完成')
  console.log(`[${nowIso()}] database build complete`)
}

function initSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE sources (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      type TEXT NOT NULL,
      root_path TEXT NOT NULL,
      meta_json TEXT NOT NULL
    );

    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      path TEXT NOT NULL,
      rel_path TEXT NOT NULL,
      ext TEXT NOT NULL,
      content TEXT NOT NULL,
      meta_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE sections (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      heading TEXT NOT NULL,
      anchor TEXT NOT NULL,
      level INTEGER NOT NULL,
      order_index INTEGER NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      content TEXT NOT NULL
    );

    CREATE TABLE questions (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      text TEXT NOT NULL,
      canonical_text TEXT NOT NULL,
      question_type TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    );

    CREATE TABLE links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_type TEXT NOT NULL,
      from_id TEXT NOT NULL,
      to_type TEXT NOT NULL,
      to_id TEXT NOT NULL,
      relation TEXT NOT NULL,
      score REAL NOT NULL,
      evidence_json TEXT NOT NULL
    );

    CREATE TABLE work_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      meta_json TEXT NOT NULL
    );

    CREATE TABLE generated_answers (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL UNIQUE,
      model TEXT NOT NULL,
      reasoning_effort TEXT NOT NULL,
      status TEXT NOT NULL,
      output_json TEXT NOT NULL,
      output_markdown TEXT NOT NULL,
      citations_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE generated_answer_runs (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      model TEXT NOT NULL,
      reasoning_effort TEXT NOT NULL,
      status TEXT NOT NULL,
      output_json TEXT NOT NULL,
      output_markdown TEXT NOT NULL,
      citations_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX generated_answer_runs_question_idx
    ON generated_answer_runs (question_id, updated_at DESC);

    CREATE TABLE work_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      project TEXT NOT NULL,
      heading TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      content TEXT NOT NULL,
      context_text TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE sections_fts USING fts5(
      section_id UNINDEXED,
      heading,
      content,
      source_id,
      kind,
      tokenize = 'unicode61 remove_diacritics 0'
    );

    CREATE VIRTUAL TABLE questions_fts USING fts5(
      question_id UNINDEXED,
      text,
      tokenize = 'unicode61 remove_diacritics 0'
    );

    CREATE VIRTUAL TABLE work_chunks_fts USING fts5(
      chunk_id UNINDEXED,
      heading,
      content,
      context_text,
      project,
      tokenize = 'unicode61 remove_diacritics 0'
    );
  `)
}

function inferQuestionType(questionText) {
  if (/(项目|经历|challenge|project|experience)/i.test(questionText)) {
    return 'project'
  }
  if (/(系统|架构|system|design|agent)/i.test(questionText)) {
    return 'system'
  }
  if (/(训练|微调|rag|推理|评测|evaluation|fine[- ]?tuning|inference)/i.test(questionText)) {
    return 'llm'
  }
  return 'general'
}

function inferDifficulty(questionText) {
  if (/(tradeoff|failure|优化|复杂|挑战|debug|deploy|安全)/i.test(questionText)) {
    return 'hard'
  }
  if (/(什么|what is|why|如何|how)/i.test(questionText)) {
    return 'medium'
  }
  return 'medium'
}

const INTERVIEW_CATEGORY_RULES = [
  {
    id: 'project-deep-dive',
    label: '项目深挖',
    order: 1,
    patterns: [
      /项目|经历|亮点|负责|贡献|踩坑|复盘|challenge|project|experience|ownership|walk me through.*project|tell me about.*project/i
    ]
  },
  {
    id: 'foundation-theory',
    label: '基础原理',
    order: 2,
    patterns: [
      /原理|公式|推导|机制|self-attention|attention|transformer|embedding|loss|梯度|what is|why does|how does/i
    ]
  },
  {
    id: 'prompt-context',
    label: 'Prompt 与上下文',
    order: 3,
    patterns: [
      /prompt|context|system prompt|in-context|few-shot|提示词|上下文|system message/i
    ]
  },
  {
    id: 'rag-retrieval',
    label: 'RAG 与检索',
    order: 4,
    patterns: [
      /rag|retrieval|rerank|embedding|vector|faiss|hnsw|chunk|召回|重排|检索|索引/i
    ]
  },
  {
    id: 'agent-tools',
    label: 'Agent 与工具',
    order: 5,
    patterns: [
      /agent|tool|mcp|planner|executor|memory|workflow|function calling|tool use|工具调用|规划/i
    ]
  },
  {
    id: 'training-alignment',
    label: '训练与对齐',
    order: 6,
    patterns: [
      /fine[- ]?tuning|sft|dpo|ppo|rlhf|lora|alignment|distill|蒸馏|对齐|微调|训练/i
    ]
  },
  {
    id: 'inference-serving',
    label: '推理与部署',
    order: 7,
    patterns: [
      /inference|serving|latency|throughput|batching|quantization|kv cache|vllm|部署|推理|量化/i
    ]
  },
  {
    id: 'evaluation-safety',
    label: '评测与安全',
    order: 8,
    patterns: [
      /evaluation|benchmark|metric|hallucination|safety|red team|jailbreak|评测|安全|幻觉|指标/i
    ]
  },
  {
    id: 'system-design',
    label: '系统设计',
    order: 9,
    patterns: [
      /system|architecture|design|reliability|queue|observability|架构|系统设计|高并发|可观测/i
    ]
  },
  {
    id: 'coding-debug',
    label: '编码与调试',
    order: 10,
    patterns: [
      /code|coding|implement|debug|bug|复杂度|手写|编码|调试|实现/i
    ]
  },
  {
    id: 'multimodal-embodied',
    label: '多模态与具身',
    order: 11,
    patterns: [
      /multimodal|vlm|vision|video|speech|robot|embodied|具身|机器人|视觉|语音/i
    ]
  },
  {
    id: 'behavioral-communication',
    label: '行为与沟通',
    order: 12,
    patterns: [
      /自我介绍|为什么|沟通|协作|冲突|成长|leadership|communication|conflict|behavioral/i
    ]
  }
]

function classifyInterviewQuestion(input) {
  const combined = [
    input.questionText,
    input.documentTitle,
    input.relPath,
    readOptionalFrontmatterString(input.frontmatter, 'company') ?? '',
    readOptionalFrontmatterString(input.frontmatter, 'role') ?? ''
  ].join('\n')

  const scored = INTERVIEW_CATEGORY_RULES
    .map((rule) => {
      let score = 0
      for (const pattern of rule.patterns) {
        if (pattern.test(combined)) {
          score += 1
        }
        if (pattern.test(input.questionText)) {
          score += 1.6
        }
      }

      if (rule.id === 'project-deep-dive' && /(面经|realquestions|real[- ]?questions|byte|字节|meta|openai|amazon|google|面试)/i.test(input.relPath)) {
        score += 0.15
      }
      if (rule.id === 'foundation-theory' && /foundation|transformer|attention|llm|模型|架构/.test(combined.toLowerCase())) {
        score += 0.2
      }
      if (rule.id === 'agent-tools' && /agent|tool|mcp|planner|executor/.test(input.sourceId.toLowerCase())) {
        score += 0.15
      }

      return {
        ...rule,
        score
      }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.order - right.order)

  const primary = scored[0] ?? INTERVIEW_CATEGORY_RULES[0]
  const secondary = (scored.length > 0 ? scored : [primary]).slice(0, 3).map((item) => ({
    id: item.id,
    label: item.label,
    order: item.order
  }))

  return {
    interviewFacet: inferInterviewFacet(input.questionText, primary.id),
    primary: {
      id: primary.id,
      label: primary.label,
      order: primary.order
    },
    secondary
  }
}

function inferInterviewFacet(questionText, primaryCategoryId) {
  if (primaryCategoryId === 'project-deep-dive') {
    return 'project'
  }
  if (primaryCategoryId === 'system-design' || primaryCategoryId === 'agent-tools') {
    return 'system'
  }
  if (primaryCategoryId === 'behavioral-communication') {
    return 'behavioral'
  }
  if (/(项目|经历|challenge|project|experience)/i.test(questionText)) {
    return 'project'
  }
  return 'knowledge'
}

function readOptionalFrontmatterString(frontmatter, key) {
  const value = frontmatter?.[key]
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null
}

function buildTokenStats(texts) {
  const counts = new Map()
  for (const text of texts) {
    const uniqueTokens = new Set(tokenizeText(text))
    for (const token of uniqueTokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1)
    }
  }
  return counts
}

function scoreWithTokenStats(questionText, targetText, targetHeading, tokenStats, corpusSize) {
  const queryTokens = tokenizeText(questionText)
  const targetTokens = new Set(tokenizeText(`${targetHeading}\n${targetText}`))
  if (queryTokens.length === 0 || targetTokens.size === 0) {
    return 0
  }

  let hitScore = 0
  let maxScore = 0

  for (const token of queryTokens) {
    const df = tokenStats.get(token) ?? 0
    const idf = Math.log((corpusSize + 1) / (df + 1)) + 1
    const headingBoost = tokenizeText(targetHeading).includes(token) ? 1.35 : 1
    maxScore += idf * headingBoost
    if (targetTokens.has(token)) {
      hitScore += idf * headingBoost
    }
  }

  return Number((hitScore / maxScore).toFixed(4))
}

function summarizeWorkProjectInspection(status, fileCount, relevance) {
  if (status === 'indexed') {
    return `Indexed ${fileCount} files from mywork (relevance ${formatScore(relevance)})`
  }
  if (status === 'indexed_via_fallback') {
    return `Indexed ${fileCount} files via supplemental paths (relevance ${formatScore(relevance)})`
  }
  if (status === 'skipped_low_relevance') {
    return `Scanned ${fileCount} files but stopped early because the project looks weakly related to the interview focus`
  }
  if (status === 'awaiting_materials') {
    return 'Project entry found, but no supported README/code/notes/notebook content yet'
  }
  return 'Project path is missing or unsupported'
}

function normalizeWorkProjectStatus(status, relevance, fileCount) {
  if (fileCount === 0) {
    return status
  }
  if (!['indexed', 'indexed_via_fallback'].includes(status)) {
    return status
  }
  return relevance >= 0.16 ? status : 'skipped_low_relevance'
}

function scoreProjectInterviewRelevance(projectName, documents) {
  if (documents.length === 0) {
    return 0
  }

  const combined = [
    projectName,
    ...documents.slice(0, 12).map((document) => `${document.title}\n${document.relPath}\n${document.content.slice(0, 2400)}`)
  ].join('\n\n')

  let score = 0
  if (/(llm|agent|rag|embedding|transformer|fine[- ]?tuning|inference|alignment|mcp|tool|planner|executor|evaluator|prompt|instruction|context|memory|natural language|single-cell|多智能体|大模型|检索增强|提示词|上下文|自然语言|记忆)/i.test(combined)) {
    score += 0.42
  }
  if (/(robot|ros2|moveit|urdf|maniskill|sim2real|real2sim|teleop|gripper|xarm|rm65|rm75|kinematic|grasp|camera|calibration|slam|point cloud|3dgs|diffusion policy|具身|机械臂|遥操作|手眼标定|场景重建)/i.test(combined)) {
    score += 0.42
  }
  if (/(paper|arxiv|neurips|iclr|corl|openreview|benchmark|evaluation|success rate|实验|评测|投稿|录用|作者|论文|sota|best paper)/i.test(combined)) {
    score += 0.1
  }
  if (documents.some((document) => document.ext === 'pdf')) {
    score += 0.04
  }
  if (documents.some((document) => ['md', 'mdx', 'markdown', 'txt'].includes(document.ext))) {
    score += 0.04
  }

  return Math.min(1, Number(score.toFixed(4)))
}

function formatScore(value) {
  return value.toFixed(2)
}

function safeObjectJson(input) {
  try {
    const parsed = JSON.parse(input)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function buildGuideSearchText(section) {
  return `${section.documentTitle}\n${section.heading}\n${section.content}`
}

function buildGuideDocumentSearchText(document) {
  return `${document.documentTitle}\n${document.relPath}\n${document.summaryText}`
}

function buildWorkSearchText(document) {
  return `${document.title}\n${document.content}`
}

function buildGuideEmbeddingText(section) {
  return `${section.documentTitle}\n${section.heading}\n${section.heading}\n${section.content.slice(0, 1800)}`
}

function buildGuideDocumentEmbeddingText(document) {
  return `${document.documentTitle}\n${document.relPath}\n${document.summaryText.slice(0, 2200)}`
}

function buildWorkEmbeddingText(document) {
  return `${document.title}\n${document.title}\n${document.content.slice(0, 1800)}`
}

function buildWorkScoringText(document, maxLength = 2200) {
  return `Project: ${document.project}\n${document.title}\n${document.relPath}\n${document.content.slice(0, maxLength)}`
}

function registerWorkChunks(document, insertWorkChunk, insertWorkChunkFts, workChunks) {
  const chunks = buildWorkChunks(document)
  for (const chunk of chunks) {
    insertWorkChunk.run({
      id: chunk.id,
      documentId: chunk.documentId,
      project: chunk.project,
      heading: chunk.heading,
      orderIndex: chunk.orderIndex,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      content: chunk.content,
      contextText: chunk.contextText
    })
    insertWorkChunkFts.run({
      chunkId: chunk.id,
      heading: chunk.heading,
      content: chunk.content,
      contextText: chunk.contextText,
      project: chunk.project
    })
    workChunks.push(chunk)
  }
}

function buildWorkChunks(document) {
  const sections = splitIntoSections(document.title, document.content)
  const documentLead = summarizeWorkLead(document.content)
  const chunks = []

  sections.forEach((section, sectionIndex) => {
    const lineChunks = splitSectionIntoLineChunks(section)
    lineChunks.forEach((chunk, chunkIndex) => {
      const heading = lineChunks.length > 1
        ? `${section.heading} · ${chunkIndex + 1}`
        : section.heading
      const contextText = buildContextualWorkChunk(document, heading, documentLead, chunk.content)
      chunks.push({
        id: hashContent(`${document.id}:${sectionIndex}:${chunkIndex}:${heading}`),
        documentId: document.id,
        documentTitle: document.title,
        relPath: document.relPath,
        ext: document.ext,
        originKind: document.originKind,
        project: document.project,
        heading,
        orderIndex: chunks.length,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        content: chunk.content,
        contextText
      })
    })
  })

  return chunks
}

function splitSectionIntoLineChunks(section, maxChars = 1600, overlapLines = 4) {
  const lines = section.content.split('\n')
  if (section.content.length <= maxChars || lines.length <= 10) {
    return [{
      startLine: section.startLine,
      endLine: section.endLine,
      content: section.content
    }]
  }

  const chunks = []
  let startIndex = 0

  while (startIndex < lines.length) {
    let endIndex = startIndex
    let charCount = 0

    while (endIndex < lines.length) {
      const nextLine = lines[endIndex]
      const nextSize = charCount + nextLine.length + 1
      if (endIndex > startIndex && nextSize > maxChars) {
        break
      }
      charCount = nextSize
      endIndex += 1
    }

    const content = lines.slice(startIndex, endIndex).join('\n').trim()
    if (content) {
      chunks.push({
        startLine: section.startLine + startIndex,
        endLine: section.startLine + endIndex - 1,
        content
      })
    }

    if (endIndex >= lines.length) {
      break
    }

    startIndex = Math.max(startIndex + 1, endIndex - overlapLines)
  }

  return chunks.length > 0 ? chunks : [{
    startLine: section.startLine,
    endLine: section.endLine,
    content: section.content
  }]
}

function summarizeWorkLead(content) {
  return content
    .split(/\n\s*\n/)
    .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
    .find((chunk) => chunk.length >= 40)
    ?.slice(0, 240) ?? ''
}

function buildContextualWorkChunk(document, heading, documentLead, content) {
  const lead = documentLead && !content.includes(documentLead) ? `Document lead: ${documentLead}\n` : ''
  return [
    `Project: ${document.project}`,
    `Document: ${document.title}`,
    `Path: ${document.relPath}`,
    `Section: ${heading}`,
    lead,
    content.slice(0, 1800)
  ].filter(Boolean).join('\n')
}

function buildWorkChunkSearchText(chunk) {
  return `${chunk.documentTitle}\n${chunk.heading}\n${chunk.contextText}`
}

function buildWorkChunkEmbeddingText(chunk) {
  return `${chunk.documentTitle}\n${chunk.heading}\n${chunk.contextText.slice(0, 1800)}`
}

function buildWorkChunkScoringText(chunk, maxLength = 2200) {
  return `Project: ${chunk.project}\n${chunk.documentTitle}\n${chunk.relPath}\n${chunk.heading}\n${chunk.contextText.slice(0, maxLength)}`
}

function countGuideEvidenceSignals(item) {
  let hits = 0
  if (item.semanticScore >= 0.36) {
    hits += 1
  }
  if (item.lexicalScore >= 0.1) {
    hits += 1
  }
  if (item.headingMatchScore >= 0.12) {
    hits += 1
  }
  if (item.softMatchScore >= 0.32) {
    hits += 1
  }
  if (item.topicScore >= 0.42) {
    hits += 1
  }
  if (item.intentScore >= 0.42) {
    hits += 1
  }
  return hits
}

function scoreHeadingMatch(questionText, heading) {
  const queryTokens = tokenizeText(questionText)
    .filter((token) => token.length > 2)
  const headingTokens = new Set(tokenizeText(heading))
  if (queryTokens.length === 0 || headingTokens.size === 0) {
    return 0
  }

  let hits = 0
  for (const token of queryTokens) {
    if (headingTokens.has(token)) {
      hits += 1
    }
  }

  return Number((hits / Math.min(queryTokens.length, 4)).toFixed(4))
}

function shouldKeepGuideLink(questionText, item, retrievalMode) {
  if (violatesPrecisionGuard(questionText, buildGuideSearchText(item))) {
    return false
  }

  const evidenceSignals = countGuideEvidenceSignals(item)
  const strongSingleSignal = item.semanticScore >= 0.58
    || item.lexicalScore >= 0.28
    || item.topicScore >= 0.74
    || item.headingMatchScore >= 0.26

  if (retrievalMode.startsWith('hybrid')) {
    return strongSingleSignal || (item.score >= 0.31 && evidenceSignals >= 2)
  }
  return item.score >= 0.22 && evidenceSignals >= 2
}

function shouldKeepGuideDocumentFallback(questionText, item, retrievalMode) {
  if (isProjectNarrativeQuestion(questionText)) {
    return false
  }
  if (violatesPrecisionGuard(questionText, buildGuideDocumentSearchText(item))) {
    return false
  }

  const evidenceSignals = countGuideEvidenceSignals(item)

  if (retrievalMode.startsWith('hybrid')) {
    return item.score >= 0.24
      && evidenceSignals >= 2
      && (item.semanticScore >= 0.34 || item.lexicalScore >= 0.1 || item.topicScore >= 0.46)
  }

  return item.score >= 0.16 && evidenceSignals >= 2 && (item.lexicalScore >= 0.1 || item.topicScore >= 0.4)
}

function shouldKeepWorkLink(questionText, item, retrievalMode) {
  if (violatesPrecisionGuard(questionText, buildWorkScoringText(item))) {
    return false
  }
  if (item.domainScore <= -0.18) {
    return false
  }

  if (isProjectNarrativeQuestion(questionText)) {
    if (retrievalMode.startsWith('hybrid')) {
      return item.score >= 0.16 || item.groundingScore >= 0.62 || item.intentScore >= 0.45
    }
    return item.score >= 0.1 || item.groundingScore >= 0.56
  }

  const questionHasDomainFocus = detectDomainProfile(questionText, 'question').totalHits > 0
  const lexicalEvidence = questionHasDomainFocus
    ? item.lexicalScore >= 0.18 && item.domainScore >= 0
    : item.lexicalScore >= 0.18
  const semanticEvidence = questionHasDomainFocus
    ? item.semanticScore >= 0.52 && item.domainScore >= 0.04
    : item.semanticScore >= 0.52
  const topicEvidence = questionHasDomainFocus
    ? item.topicScore >= 0.55 && item.domainScore >= 0.04
    : item.topicScore >= 0.55

  const hasDirectEvidence = item.domainScore >= 0.08
    || lexicalEvidence
    || semanticEvidence
    || topicEvidence

  const isOverviewFallback = item.project === '_overview'
    && item.domainScore >= 0.05
    && item.groundingScore >= 0.48
    && item.score >= 0.16

  if (retrievalMode.startsWith('hybrid')) {
    return (hasDirectEvidence && item.score >= 0.16)
      || (item.groundingScore >= 0.72 && item.domainScore >= 0.05 && item.topicScore >= 0.42)
      || isOverviewFallback
  }
  return (
    (
      item.score >= 0.12
      || lexicalEvidence
      || topicEvidence
    )
    && item.domainScore >= -0.08
  ) || (item.project === '_overview' && item.domainScore >= 0.05 && item.score >= 0.1)
}

function shouldKeepWorkChunkLink(questionText, item, retrievalMode) {
  if (violatesPrecisionGuard(questionText, buildWorkChunkScoringText(item))) {
    return false
  }
  if (item.domainScore <= -0.18) {
    return false
  }

  if (isProjectNarrativeQuestion(questionText)) {
    return retrievalMode.startsWith('hybrid')
      ? item.score >= 0.16 || item.groundingScore >= 0.62
      : item.score >= 0.11 || item.groundingScore >= 0.54
  }

  const hasEvidence = item.lexicalScore >= 0.16
    || item.semanticScore >= 0.48
    || item.topicScore >= 0.5
    || item.headingMatchScore >= 0.24

  if (retrievalMode.startsWith('hybrid')) {
    return (hasEvidence && item.score >= 0.14)
      || (item.groundingScore >= 0.72 && item.topicScore >= 0.42)
  }

  return hasEvidence && item.score >= 0.1
}

function shouldKeepMergedWorkLink(questionText, item, retrievalMode) {
  if (violatesPrecisionGuard(questionText, buildWorkScoringText(item))) {
    return false
  }
  if (item.domainScore <= -0.18) {
    return false
  }
  if ((item.chunkEvidence?.length ?? 0) > 0) {
    return retrievalMode.startsWith('hybrid')
      ? item.score >= 0.18 || (item.chunkAggregateScore ?? 0) >= 0.24
      : item.score >= 0.12 || (item.chunkAggregateScore ?? 0) >= 0.16
  }
  return shouldKeepWorkLink(questionText, item, retrievalMode)
}

function mergeWorkCandidates(questionText, documentCandidates, chunkCandidates) {
  const byDocumentId = new Map()

  for (const candidate of documentCandidates) {
    byDocumentId.set(candidate.id, {
      ...candidate,
      chunkAggregateScore: 0,
      chunkEvidence: []
    })
  }

  for (const chunk of chunkCandidates) {
    const current = byDocumentId.get(chunk.documentId) ?? {
      id: chunk.documentId,
      title: chunk.documentTitle,
      relPath: chunk.relPath,
      ext: chunk.ext,
      originKind: chunk.originKind,
      project: chunk.project,
      content: chunk.content,
      domainScore: chunk.domainScore,
      headingMatchScore: chunk.headingMatchScore,
      groundingScore: chunk.groundingScore,
      intentScore: chunk.intentScore,
      lexicalScore: chunk.lexicalScore,
      semanticScore: chunk.semanticScore,
      softMatchScore: chunk.softMatchScore,
      topicScore: chunk.topicScore,
      score: chunk.score,
      chunkAggregateScore: 0,
      chunkEvidence: []
    }

    const nextEvidence = [...(current.chunkEvidence ?? []), {
      heading: chunk.heading,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      excerpt: chunk.content.slice(0, 420),
      score: chunk.score
    }]
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)

    const rankedScores = nextEvidence.map((item) => item.score).sort((left, right) => right - left)
    const chunkAggregateScore = Number(Math.min(
      1,
      (rankedScores[0] ?? 0)
        + (rankedScores[1] ?? 0) * 0.24
        + (rankedScores[2] ?? 0) * 0.12
    ).toFixed(4))

    const mergedScore = isProjectNarrativeQuestion(questionText)
      ? Number(Math.min(1, current.score * 0.68 + chunkAggregateScore * 0.42).toFixed(4))
      : Number(Math.min(1, Math.max(current.score, chunkAggregateScore * 0.84 + current.score * 0.22)).toFixed(4))

    byDocumentId.set(chunk.documentId, {
      ...current,
      domainScore: Math.max(current.domainScore ?? -1, chunk.domainScore),
      headingMatchScore: Math.max(current.headingMatchScore ?? 0, chunk.headingMatchScore),
      groundingScore: Math.max(current.groundingScore ?? 0, chunk.groundingScore),
      intentScore: Math.max(current.intentScore ?? 0, chunk.intentScore),
      lexicalScore: Math.max(current.lexicalScore ?? 0, chunk.lexicalScore),
      semanticScore: Math.max(current.semanticScore ?? 0, chunk.semanticScore),
      softMatchScore: Math.max(current.softMatchScore ?? 0, chunk.softMatchScore),
      topicScore: Math.max(current.topicScore ?? 0, chunk.topicScore),
      score: mergedScore,
      chunkAggregateScore,
      chunkEvidence: nextEvidence
    })
  }

  return [...byDocumentId.values()]
}

function selectWorkHintLinks(questionText, candidates, strongLinks) {
  const seenIds = new Set(strongLinks.map((item) => item.id))
  const pool = candidates.filter((candidate) => {
    if (seenIds.has(candidate.id)) {
      return false
    }
    if (candidate.project === '_overview') {
      return candidate.score >= 0.04
    }
    return candidate.score >= 0.06 || (candidate.chunkEvidence?.length ?? 0) > 0
  })

  if (pool.length === 0) {
    return []
  }

  const ordered = [...pool].sort((left, right) => (
    scoreAdjacentWorkCandidate(questionText, right) - scoreAdjacentWorkCandidate(questionText, left)
    || right.score - left.score
  ))
  const knowledgeFriendlyOrdered = isSpecificKnowledgeQuestion(questionText)
    ? [
        ...ordered.filter((candidate) => candidate.project !== '_overview'),
        ...ordered.filter((candidate) => candidate.project === '_overview')
      ]
    : ordered

  if (isProjectNarrativeQuestion(questionText)) {
    return ordered.slice(0, 2)
  }

  return knowledgeFriendlyOrdered.slice(0, 3)
}

function selectWorkLinks(questionText, candidates) {
  const directCandidates = [...candidates]
    .filter((candidate) => isDirectWorkEvidence(questionText, candidate))
    .sort((left, right) => (
      scoreDirectWorkCandidate(questionText, right) - scoreDirectWorkCandidate(questionText, left)
      || right.score - left.score
    ))

  return directCandidates.slice(0, 4).map((candidate, index) => ({
    ...candidate,
    score: Number((candidate.score + Math.max(0, 0.08 - index * 0.02)).toFixed(4))
  }))
}

function scoreSoftOverlap(questionText, targetText) {
  const queryTokens = tokenizeText(questionText)
    .filter((token) => token.length > 2)
  const targetKeys = new Set(buildSoftTokenKeys(targetText))
  if (queryTokens.length === 0 || targetKeys.size === 0) {
    return 0
  }

  let hitScore = 0
  let maxScore = 0
  for (const token of queryTokens) {
    const weight = token.length >= 8 ? 1.4 : token.length >= 5 ? 1.15 : 1
    maxScore += weight
    const keys = tokenToSoftKeys(token)
    if (keys.some((key) => targetKeys.has(key))) {
      hitScore += weight
    }
  }

  return Number((hitScore / maxScore).toFixed(4))
}

function buildSoftTokenKeys(text) {
  return tokenizeText(text)
    .flatMap((token) => tokenToSoftKeys(token))
}

function tokenToSoftKeys(token) {
  const keys = [token]
  if (/^[a-z0-9+_.-]+$/.test(token)) {
    if (token.length >= 5) {
      keys.push(token.slice(0, 5))
    }
    if (token.endsWith('ing') && token.length >= 7) {
      keys.push(token.slice(0, -3))
    }
    if (token.endsWith('tion') && token.length >= 7) {
      keys.push(token.slice(0, -4))
    }
    if (token.endsWith('ions') && token.length >= 7) {
      keys.push(token.slice(0, -4))
    }
    if (token.endsWith('ers') && token.length >= 6) {
      keys.push(token.slice(0, -1))
    }
    if (token.endsWith('es') && token.length >= 5) {
      keys.push(token.slice(0, -2))
    } else if (token.endsWith('s') && token.length >= 5) {
      keys.push(token.slice(0, -1))
    }
    if (token.endsWith('ed') && token.length >= 5) {
      keys.push(token.slice(0, -2))
    }
  }
  return [...new Set(keys.filter(Boolean))]
}

function escapeRegExp(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function textHasKeyword(text, keyword) {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) {
    return false
  }

  if (/[\u4e00-\u9fff]/.test(normalizedKeyword)) {
    return text.includes(normalizedKeyword)
  }

  if (!/[a-z0-9]/i.test(normalizedKeyword)) {
    return text.includes(normalizedKeyword)
  }

  const escaped = escapeRegExp(normalizedKeyword).replace(/ /g, '\\s+')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
}

const TOPIC_FAMILIES = [
  {
    questionKeywords: ['evaluate', 'evaluation', 'benchmark', 'metrics', 'metric', 'judge', 'arena', 'best model', 'model selection', '评估', '指标', '基准'],
    candidateKeywords: ['评估', 'benchmark', 'judge', 'arena', 'metric', 'metrics', 'benchmarks', '评分', '打分', '基准', '维度', '评测']
  },
  {
    questionKeywords: ['embedding model', 'text embedding', 'sentence embedding', 'vector index', 'vector db', 'vector database', 'vector store', 'embeddings', 'embedding', 'semantic search', '嵌入模型', '向量索引', '向量数据库', '向量检索'],
    candidateKeywords: ['embedding model', 'text embedding', 'sentence embedding', 'vector index', 'vector db', 'vector database', 'vector store', 'faiss', 'milvus', 'pgvector', 'chroma', 'hnsw', 'ann', 'semantic search', '嵌入模型', '向量索引', '向量数据库', '向量检索']
  },
  {
    questionKeywords: ['rag', 'retrieval augmented', 'retrieval-augmented', 'retriever', 'reranker', 'rerank', 'grounding', 'hallucination', '检索增强', '召回', '重排', '幻觉'],
    candidateKeywords: ['rag', 'retrieval augmented', 'retrieval-augmented', 'retriever', 'reranker', 'rerank', 'vector database', 'vector store', 'grounding', 'hallucination', '检索增强', '召回', '重排', '向量数据库', '幻觉']
  },
  {
    questionKeywords: ['agent', 'agents', 'multi-agent', 'tool use', 'tool calling', 'function calling', 'mcp', 'planning', 'planner', 'executor', 'evaluator', 'memory', 'working memory', 'episodic memory', 'semantic memory', 'long-term memory', 'short-term memory', 'scratchpad', 'state store', '智能体', '多智能体', '工具调用', '记忆', '短期记忆', '长期记忆', '工作记忆', '状态管理'],
    candidateKeywords: ['multi-agent', 'tool use', 'tool calling', 'function calling', 'mcp', 'planning', 'planner', 'executor', 'evaluator', 'memory', 'working memory', 'episodic memory', 'semantic memory', 'long-term memory', 'short-term memory', 'scratchpad', 'state store', '智能体', '多智能体', '工具调用', '记忆', '短期记忆', '长期记忆', '工作记忆', '状态管理']
  },
  {
    questionKeywords: ['prompt engineering', 'prompt design', 'prompt tuning', 'system prompt', 'instruction', 'context', 'few-shot', 'few shot', 'zero-shot', 'zero shot', 'chain-of-thought', 'cot', '提示词', '提示工程', '系统提示', '上下文', '指令'],
    candidateKeywords: ['prompt', 'prompt engineering', 'prompt design', 'prompt tuning', 'system prompt', 'instruction', 'context', 'in-context learning', 'few-shot', 'few shot', 'zero-shot', 'zero shot', 'chain-of-thought', 'cot', 'json format', '提示词', '提示工程', '系统提示', '上下文', '指令']
  },
  {
    questionKeywords: ['fine-tune', 'finetune', 'fine tuning', 'lora', 'qlora', 'sft', '微调'],
    candidateKeywords: ['fine-tune', 'finetune', 'lora', 'qlora', 'sft', 'adapter', '微调']
  },
  {
    questionKeywords: ['attention', 'kv cache', 'rope', 'transformer', 'decoder-only', 'self-attention', '注意力'],
    candidateKeywords: ['attention', 'kv cache', 'rope', 'transformer', 'decoder-only', 'self-attention', '注意力']
  },
  {
    questionKeywords: ['alignment', 'rlhf', 'dpo', 'reward model', 'safety', '对齐', '安全'],
    candidateKeywords: ['alignment', 'rlhf', 'dpo', 'reward', 'safety', 'judge', '对齐', '安全']
  },
  {
    questionKeywords: ['quantization', 'int4', 'int8', 'gguf', 'consumer hardware', '量化'],
    candidateKeywords: ['quantization', 'int4', 'int8', 'gguf', '量化', '蒸馏', 'low-rank']
  },
  {
    questionKeywords: ['multimodal', 'vlm', 'vision-language', 'vision language', '多模态'],
    candidateKeywords: ['multimodal', 'vlm', 'vision-language', 'vision language', '多模态', '视觉语言']
  },
  {
    questionKeywords: ['deploy', 'deployment', 'serving', 'latency', 'throughput', 'vllm', 'tgi', 'prefill', 'decode', '推理', '部署', '吞吐', '时延'],
    candidateKeywords: ['model serving', 'serving', 'latency', 'throughput', 'vllm', 'tgi', 'prefill', 'decode', 'continuous batching', 'speculative decoding', 'kv cache', 'tokens/s', 'token/s', '推理', '吞吐', '时延']
  }
]

const PRECISION_GUARDS = [
  {
    questionKeywords: ['multi-head attention', 'self-attention', 'attention', 'transformer', 'query', 'key', 'value', 'qkv'],
    candidateKeywords: ['multi-head attention', 'self-attention', 'attention', 'transformer', 'query', 'key', 'value', 'qkv']
  },
  {
    questionKeywords: ['tokenization', 'tokenizer', 'token embedding', 'positional embedding', 'embedding'],
    candidateKeywords: ['tokenization', 'tokenizer', 'token embedding', 'positional embedding', 'embedding']
  },
  {
    questionKeywords: ['kv cache', 'rope', 'rotary', 'positional encoding'],
    candidateKeywords: ['kv cache', 'rope', 'rotary', 'positional encoding']
  },
  {
    questionKeywords: ['lora', 'qlora', 'sft', 'rlhf', 'dpo'],
    candidateKeywords: ['lora', 'qlora', 'sft', 'rlhf', 'dpo']
  },
  {
    questionKeywords: ['rag', 'retriever', 'reranker', 'hybrid search', 'vector db', 'embedding model'],
    candidateKeywords: ['rag', 'retriever', 'reranker', 'hybrid search', 'vector db', 'embedding model']
  }
]

const DOMAIN_FAMILIES = [
  {
    name: 'llm_retrieval',
    group: 'llm',
    questionKeywords: ['embedding model', 'text embedding', 'sentence embedding', 'vector index', 'vector db', 'vector database', 'vector store', 'semantic search', 'faiss', 'milvus', 'pgvector', 'chroma', 'hnsw', 'ann', 'rag', 'retrieval augmented', 'retrieval-augmented', 'reranker', 'rerank', 'retriever', 'hallucination', 'grounding', 'sufficient context', 'answer only if', 'answer only when', 'grounded answer', '嵌入模型', '向量数据库', '向量索引', '向量检索', '检索增强', '召回', '重排', '幻觉', '依据上下文'],
    candidateKeywords: ['embedding model', 'text embedding', 'sentence embedding', 'vector index', 'vector db', 'vector database', 'vector store', 'semantic search', 'faiss', 'milvus', 'pgvector', 'chroma', 'hnsw', 'ann', 'rag', 'retrieval augmented', 'retrieval-augmented', 'reranker', 'rerank', 'retriever', '嵌入模型', '向量数据库', '向量索引', '向量检索', '检索增强', '召回', '重排']
  },
  {
    name: 'llm_agent',
    group: 'llm',
    questionKeywords: ['agent', 'agents', 'multi-agent', 'tool use', 'tool calling', 'function calling', 'mcp', 'planner', 'executor', 'evaluator', 'langchain', 'langgraph', 'memory', 'working memory', 'episodic memory', 'semantic memory', 'long-term memory', 'short-term memory', 'scratchpad', 'state store', 'memory module', '智能体', '多智能体', '工具调用', '记忆', '短期记忆', '长期记忆', '工作记忆', '状态管理'],
    candidateKeywords: ['agent system', 'multi-agent', 'tool use', 'tool calling', 'function calling', 'mcp', 'planner', 'executor', 'evaluator', 'langchain', 'langgraph', 'memory', 'working memory', 'episodic memory', 'semantic memory', 'long-term memory', 'short-term memory', 'scratchpad', 'state store', 'memory module', '智能体', '多智能体', '工具调用', '记忆', '短期记忆', '长期记忆', '工作记忆', '状态管理']
  },
  {
    name: 'llm_prompt',
    group: 'llm',
    questionKeywords: ['prompt', 'prompt engineering', 'prompt design', 'prompt tuning', 'system prompt', 'instruction', 'context', 'few-shot', 'few shot', 'zero-shot', 'zero shot', 'chain-of-thought', 'cot', 'role prompt', '提示词', '提示工程', '系统提示', '上下文', '指令'],
    candidateKeywords: ['prompt', 'prompt engineering', 'prompt design', 'prompt tuning', 'system prompt', 'instruction', 'context', 'in-context learning', 'few-shot', 'few shot', 'zero-shot', 'zero shot', 'chain-of-thought', 'cot', 'json format', 'prompt template', '提示词', '提示工程', '系统提示', '上下文', '指令']
  },
  {
    name: 'llm_serving',
    group: 'llm',
    questionKeywords: ['llm inference', 'model serving', 'serving', 'throughput', 'latency', 'prefill', 'decode', 'continuous batching', 'speculative decoding', 'vllm', 'tgi', 'ttft', 'tpot', 'tokens/s', 'token/s', 'kv cache', '大模型推理', '模型服务', '推理', '部署', '吞吐', '时延', '首token'],
    candidateKeywords: ['llm inference', 'model serving', 'serving', 'throughput', 'latency', 'prefill', 'decode', 'continuous batching', 'speculative decoding', 'vllm', 'tgi', 'ttft', 'tpot', 'tokens/s', 'token/s', 'kv cache', '大模型推理', '模型服务', '推理', '吞吐', '时延', '首token']
  },
  {
    name: 'llm_model',
    group: 'llm',
    questionKeywords: ['llm', 'llms', 'large language model', 'transformer', 'transformers', 'attention', 'self-attention', 'kv cache', 'rope', 'fine-tune', 'fine-tuning', 'finetune', 'fine tuning', 'lora', 'qlora', 'sft', 'alignment', 'rlhf', 'dpo', 'reward model', 'quantization', 'int4', 'int8', 'gradient accumulation', 'model parallelism', 'pretraining', 'pre-training', 'causal language modeling', 'masked language modeling', 'out-of-vocabulary', 'oov', 'scaling law', '大模型', '微调', '对齐', '量化'],
    candidateKeywords: ['llm', 'llms', 'large language model', 'transformer', 'decoder-only', 'kv cache', 'rope', 'tensor parallel', 'pipeline parallel', 'triton', 'cuda', 'gpu', 'quantization', 'int4', 'int8', 'gguf', 'fine-tune', 'finetune', 'lora', 'qlora', 'sft', 'alignment', 'rlhf', 'dpo', 'reward model', '量化']
  },
  {
    name: 'robotics_control',
    group: 'robotics',
    questionKeywords: ['robot', 'robotics', 'embodied', 'ros2', 'moveit', 'urdf', 'teleop', 'gripper', 'kinematics', 'ik', 'fk', 'sim2real', 'real2sim', 'controller', 'policy', 'world model', '机械臂', '具身', '遥操作', '运动学', '控制', '抓取', '仿真'],
    candidateKeywords: ['robot', 'robotics', 'embodied', 'ros2', 'moveit', 'urdf', 'teleop', 'gripper', 'kinematics', 'ik', 'fk', 'sim2real', 'real2sim', 'controller', 'policy', 'world model', '机械臂', '具身', '遥操作', '运动学', '控制', '抓取', '仿真']
  },
  {
    name: 'vision_3d',
    group: 'robotics',
    questionKeywords: ['groundingdino', 'sam2', 'sam3', 'mast3r', 'colmap', 'vggt', 'point cloud', '3d reconstruction', '3dgs', 'gaussian splatting', 'camera pose', 'icp', 'calibration', '手眼标定', '点云', '三维重建', '场景重建', '相机定位'],
    candidateKeywords: ['groundingdino', 'sam2', 'sam3', 'mast3r', 'colmap', 'vggt', 'point cloud', '3d reconstruction', '3dgs', 'gaussian splatting', 'camera pose', 'icp', 'calibration', '手眼标定', '点云', '三维重建', '场景重建', '相机定位']
  },
  {
    name: 'science_analysis',
    group: 'science',
    questionKeywords: ['single-cell', 'scrna', 'spatial transcriptomics', 'omics', 'bioinformatics', '单细胞', '空间转录组', '生物信息'],
    candidateKeywords: ['single-cell', 'scrna', 'spatial transcriptomics', 'omics', 'bioinformatics', '单细胞', '空间转录组', '生物信息']
  }
]

const DOMAIN_FAMILY_BY_NAME = new Map(DOMAIN_FAMILIES.map((family) => [family.name, family]))

const STRICT_DIRECT_FAMILY_RULES = {
  llm_retrieval: {
    candidateKeywords: ['rag', 'retrieval', 'retriever', 'reranker', 'rerank', 'vector db', 'vector database', 'vector store', 'embedding model', 'text embedding', 'faiss', 'milvus', 'pgvector', 'chroma', 'hnsw', '向量数据库', '向量检索', '检索增强', '召回', '重排'],
    minCandidateHits: 1
  },
  llm_agent: {
    candidateKeywords: ['agent', 'multi-agent', 'tool use', 'tool calling', 'function calling', 'mcp', 'planner', 'executor', 'evaluator', 'langchain', 'langgraph', 'memory', 'working memory', 'episodic memory', 'semantic memory', 'long-term memory', 'short-term memory', 'scratchpad', 'state store', 'memory module', '智能体', '多智能体', '工具调用', '记忆', '短期记忆', '长期记忆', '工作记忆', '状态管理'],
    minCandidateHits: 1
  },
  llm_prompt: {
    candidateKeywords: ['prompt', 'prompt engineering', 'prompt design', 'prompt tuning', 'system prompt', 'instruction', 'context', 'few-shot', 'few shot', 'zero-shot', 'zero shot', 'chain-of-thought', 'cot', 'in-context learning', 'json format', 'prompt template', '提示词', '提示工程', '系统提示', '上下文', '指令'],
    anchorKeywords: ['llm', 'large language model', 'language model', 'instruction following', 'in-context learning', 'agent', 'multi-agent', '大模型'],
    minCandidateHits: 2
  },
  llm_serving: {
    candidateKeywords: ['llm inference', 'model serving', 'throughput', 'latency', 'prefill', 'decode', 'continuous batching', 'speculative decoding', 'vllm', 'tgi', 'ttft', 'tpot', 'tokens/s', 'token/s', 'kv cache', '推理', '吞吐', '时延', '首token'],
    anchorKeywords: ['llm', 'large language model', 'language model', 'transformer', 'decoder-only', 'vllm', 'tgi', '大模型'],
    minCandidateHits: 2,
    systemKeywords: ['throughput', 'latency', 'prefill', 'decode', 'continuous batching', 'speculative decoding', 'tokens/s', 'token/s', 'ttft', 'tpot', 'kv cache', 'model serving', '推理', '吞吐', '时延', '首token']
  },
  llm_model: {
    candidateKeywords: ['llm', 'large language model', 'transformer', 'decoder-only', 'kv cache', 'rope', 'quantization', 'int4', 'int8', 'tensor parallel', 'pipeline parallel', 'cuda', 'gpu', 'fine-tune', 'finetune', 'lora', 'qlora', 'sft', 'alignment', 'rlhf', 'dpo', 'reward model', '大模型', '量化', '微调', '对齐'],
    anchorKeywords: ['llm', 'large language model', 'language model', 'transformer', 'decoder-only', 'kv cache', 'context window', '大模型'],
    minCandidateHits: 2,
    systemKeywords: ['kv cache', 'rope', 'quantization', 'tensor parallel', 'pipeline parallel', 'cuda', 'gpu', 'fine-tune', 'lora', 'qlora', 'sft', 'alignment', 'rlhf', 'dpo', '量化', '微调', '对齐']
  },
  robotics_control: {
    candidateKeywords: ['robot', 'robotics', 'embodied', 'ros2', 'moveit', 'urdf', 'teleop', 'gripper', 'kinematics', 'ik', 'fk', 'sim2real', 'controller', 'policy', '机械臂', '具身', '遥操作', '运动学', '控制', '抓取', '仿真'],
    minCandidateHits: 1
  },
  vision_3d: {
    candidateKeywords: ['point cloud', '3d reconstruction', '3dgs', 'gaussian splatting', 'camera pose', 'calibration', 'groundingdino', 'sam2', 'mast3r', '点云', '三维重建', '场景重建', '手眼标定'],
    minCandidateHits: 1
  },
  science_analysis: {
    candidateKeywords: ['single-cell', 'scrna', 'spatial transcriptomics', 'omics', 'bioinformatics', '单细胞', '空间转录组', '生物信息'],
    minCandidateHits: 1
  }
}

const FAMILY_COMPATIBILITY_BONUS = {
  llm_agent: {
    llm_model: 0.06,
    llm_serving: 0.06,
    llm_prompt: 0.14,
    llm_retrieval: 0.12
  },
  llm_model: {
    llm_agent: 0.06,
    llm_serving: 0.12,
    llm_prompt: 0.08,
    llm_retrieval: 0.06
  },
  llm_serving: {
    llm_agent: 0.06,
    llm_model: 0.12,
    llm_retrieval: 0.06
  },
  llm_prompt: {
    llm_agent: 0.14,
    llm_model: 0.08,
    llm_retrieval: 0.1
  },
  llm_retrieval: {
    llm_agent: 0.12,
    llm_model: 0.06,
    llm_prompt: 0.1
  },
  science_analysis: {
    llm_agent: 0.1
  }
}

function scoreTopicAlignment(questionText, candidateText) {
  const normalizedQuestion = questionText.toLowerCase()
  const normalizedCandidate = candidateText.toLowerCase()
  let bestScore = 0

  for (const family of TOPIC_FAMILIES) {
    const questionHits = countKeywordHits(normalizedQuestion, family.questionKeywords)
    if (questionHits === 0) {
      continue
    }
    const candidateHits = countKeywordHits(normalizedCandidate, family.candidateKeywords)
    if (candidateHits === 0) {
      continue
    }

    const familyScore = Math.min(
      1,
      0.42 + Math.min(questionHits, 2) * 0.12 + Math.min(candidateHits, 3) * 0.16
    )
    bestScore = Math.max(bestScore, Number(familyScore.toFixed(4)))
  }

  return bestScore
}

function getDirectEvidenceSignal(questionText, candidateText) {
  const questionProfile = detectDomainProfile(questionText, 'question')
  const candidateProfile = detectDomainProfile(candidateText, 'candidate')
  const questionPrimary = questionProfile.primary
  const overlapHits = questionPrimary ? (candidateProfile.scores[questionPrimary] ?? 0) : 0
  const rule = questionPrimary ? STRICT_DIRECT_FAMILY_RULES[questionPrimary] ?? null : null
  const hardCandidateHits = rule
    ? countKeywordHits(candidateText.toLowerCase(), rule.candidateKeywords)
    : 0

  return {
    candidateProfile,
    hardCandidateHits,
    hasSamePrimary: overlapHits > 0,
    overlapHits,
    questionPrimary,
    questionProfile,
    rule
  }
}

function isDirectWorkEvidence(questionText, candidate) {
  if (isProjectNarrativeQuestion(questionText)) {
    return true
  }

  if (isSpecificKnowledgeQuestion(questionText) && candidate.project === '_overview') {
    return false
  }

  const signal = getDirectEvidenceSignal(questionText, buildWorkScoringText(candidate))
  const hasSupportingEvidence = candidate.lexicalScore >= 0.08
    || candidate.semanticScore >= 0.46
    || candidate.topicScore >= 0.42
    || candidate.headingMatchScore >= 0.2
    || (candidate.chunkAggregateScore ?? 0) >= 0.22

  if (signal.questionProfile.totalHits === 0) {
    return candidate.project !== '_overview'
      && candidate.score >= 0.22
      && candidate.groundingScore >= 0.66
      && ((candidate.chunkAggregateScore ?? 0) >= 0.18 || candidate.semanticScore >= 0.48)
  }

  if (!signal.hasSamePrimary || candidate.domainScore < 0.08 || !hasSupportingEvidence) {
    return false
  }

  if (signal.questionPrimary === 'llm_model' && signal.rule) {
    const candidateText = buildWorkScoringText(candidate).toLowerCase()
    const anchorHits = countKeywordHits(candidateText, signal.rule.anchorKeywords ?? [])
    const systemHits = countKeywordHits(candidateText, signal.rule.systemKeywords ?? [])

    return anchorHits >= 1
      && systemHits >= 1
      && signal.hardCandidateHits >= Math.max(3, signal.rule.minCandidateHits)
  }

  if (signal.questionPrimary === 'llm_serving' && signal.rule) {
    const candidateText = buildWorkScoringText(candidate).toLowerCase()
    const anchorHits = countKeywordHits(candidateText, signal.rule.anchorKeywords ?? [])
    const systemHits = countKeywordHits(candidateText, signal.rule.systemKeywords ?? [])

    return anchorHits >= 1
      && systemHits >= 1
      && signal.hardCandidateHits >= Math.max(2, signal.rule.minCandidateHits)
      && candidate.domainScore >= 0.12
  }

  if (signal.questionPrimary === 'llm_prompt' && signal.rule) {
    const candidateText = buildWorkScoringText(candidate).toLowerCase()
    const anchorHits = countKeywordHits(candidateText, signal.rule.anchorKeywords ?? [])

    return anchorHits >= 1
      && signal.hardCandidateHits >= Math.max(2, signal.rule.minCandidateHits)
      && candidate.domainScore >= 0.12
  }

  return signal.rule
    ? signal.hardCandidateHits >= signal.rule.minCandidateHits
    : candidate.score >= 0.2
}

function scoreDirectWorkCandidate(questionText, candidate) {
  const signal = getDirectEvidenceSignal(questionText, buildWorkScoringText(candidate))
  let score = candidate.score

  if (signal.hasSamePrimary) {
    score += 0.16
  }
  if (signal.questionPrimary === 'llm_serving' && !hasLlmServingCandidateSignal(buildWorkScoringText(candidate).toLowerCase())) {
    score -= 0.18
  }
  score += Math.min(signal.hardCandidateHits, 3) * 0.05
  if ((candidate.chunkEvidence?.length ?? 0) > 0) {
    score += 0.06
  }
  if (candidate.project === '_overview') {
    score -= 0.24
  }

  return Number(score.toFixed(4))
}

function scoreAdjacentWorkCandidate(questionText, candidate) {
  const signal = getDirectEvidenceSignal(questionText, buildWorkScoringText(candidate))
  let score = candidate.score

  if (signal.hasSamePrimary) {
    if (signal.questionPrimary === 'llm_prompt' && signal.rule) {
      const candidateText = buildWorkScoringText(candidate).toLowerCase()
      const anchorHits = countKeywordHits(candidateText, signal.rule.anchorKeywords ?? [])
      score += anchorHits >= 1 ? 0.18 : 0.03
    } else if (signal.questionPrimary === 'llm_serving' && signal.rule) {
      const candidateText = buildWorkScoringText(candidate).toLowerCase()
      const anchorHits = countKeywordHits(candidateText, signal.rule.anchorKeywords ?? [])
      const systemHits = countKeywordHits(candidateText, signal.rule.systemKeywords ?? [])
      score += anchorHits >= 1 && systemHits >= 1 ? 0.2 : -0.1
    } else {
      score += 0.18
    }
  } else if (signal.questionProfile.totalHits > 0 && signal.candidateProfile.totalHits > 0) {
    score += getFamilyCompatibilityBonus(signal.questionPrimary, signal.candidateProfile.primary) || 0.04
  }
  score += Math.min(0.12, (candidate.chunkAggregateScore ?? 0) * 0.25)
  if ((candidate.chunkEvidence?.length ?? 0) > 0) {
    score += 0.08
  }
  if (candidate.project === '_overview' && isSpecificKnowledgeQuestion(questionText)) {
    score -= 0.18
  }
  if (candidate.originKind === 'supplemental') {
    score -= 0.08
  }

  return Number(score.toFixed(4))
}

function violatesPrecisionGuard(questionText, candidateText) {
  if (isProjectNarrativeQuestion(questionText)) {
    return false
  }

  const normalizedQuestion = questionText.toLowerCase()
  const normalizedCandidate = candidateText.toLowerCase()

  if (isLlmServingQuestion(normalizedQuestion) && !hasLlmServingCandidateSignal(normalizedCandidate)) {
    return true
  }

  for (const guard of PRECISION_GUARDS) {
    const questionMatched = guard.questionKeywords.some((keyword) => textHasKeyword(normalizedQuestion, keyword))
    if (!questionMatched) {
      continue
    }

    const candidateMatched = guard.candidateKeywords.some((keyword) => textHasKeyword(normalizedCandidate, keyword))
    if (!candidateMatched) {
      return true
    }
  }

  return false
}

function countKeywordHits(text, keywords) {
  let hits = 0
  for (const keyword of new Set(keywords)) {
    if (textHasKeyword(text, keyword)) {
      hits += 1
    }
  }
  return hits
}

function detectDomainProfile(text, mode) {
  const normalized = text.toLowerCase()
  const scores = {}
  let totalHits = 0

  for (const family of DOMAIN_FAMILIES) {
    const keywords = mode === 'question' ? family.questionKeywords : family.candidateKeywords
    const hits = countKeywordHits(normalized, keywords)
    scores[family.name] = hits
    totalHits += hits
  }

  const rankedDomains = DOMAIN_FAMILIES
    .map((family) => ({
      group: family.group,
      hits: scores[family.name],
      name: family.name
    }))
    .filter((item) => item.hits > 0)
    .sort((left, right) => right.hits - left.hits)

  return {
    primary: rankedDomains[0]?.name ?? null,
    rankedDomains,
    scores,
    totalHits
  }
}

function getFamilyCompatibilityBonus(questionPrimary, candidatePrimary) {
  if (!questionPrimary || !candidatePrimary) {
    return 0
  }

  const direct = FAMILY_COMPATIBILITY_BONUS[questionPrimary]?.[candidatePrimary] ?? 0
  const reverse = FAMILY_COMPATIBILITY_BONUS[candidatePrimary]?.[questionPrimary] ?? 0
  return Math.max(direct, reverse)
}

function isPromptQuestion(questionText) {
  return /(prompt|prompt engineering|prompt design|prompt tuning|system prompt|instruction|context|few-shot|few shot|zero-shot|zero shot|chain-of-thought|cot|提示词|提示工程|系统提示|上下文|指令)/i.test(questionText)
}

function isAgentMemoryQuestion(questionText) {
  return /(agent|multi-agent|智能体|多智能体|mcp|planner|executor|tool use|tool calling|function calling)/i.test(questionText)
    && /(memory|working memory|episodic memory|semantic memory|long-term memory|short-term memory|scratchpad|state store|memory module|记忆|短期记忆|长期记忆|工作记忆|状态管理)/i.test(questionText)
}

function hasAgentMemoryCandidateSignal(text) {
  return /(agent|multi-agent|智能体|多智能体|mcp|planner|executor|tool use|tool calling|function calling|workflow)/i.test(text)
    && /(memory|working memory|episodic memory|semantic memory|long-term memory|short-term memory|scratchpad|state store|memory module|context management|session state|记忆|短期记忆|长期记忆|工作记忆|状态管理|会话状态)/i.test(text)
}

function isLlmServingQuestion(questionText) {
  return (
    /(llm inference|model serving|large language model|language model|llm|transformer|decoder-only|大模型推理|模型服务|大模型)/i.test(questionText)
      && /(throughput|latency|prefill|decode|continuous batching|speculative decoding|vllm|tgi|ttft|tpot|tokens\/s|token\/s|kv cache|qps|推理|部署|吞吐|时延|首token|首个token)/i.test(questionText)
  ) || /(llm inference|model serving|大模型推理|模型服务)/i.test(questionText)
}

function hasLlmServingCandidateSignal(text) {
  return /(llm|large language model|language model|transformer|decoder-only|vllm|tgi|大模型)/i.test(text)
    && /(throughput|latency|prefill|decode|continuous batching|speculative decoding|ttft|tpot|tokens\/s|token\/s|kv cache|model serving|inference|推理|吞吐|时延|首token|首个token)/i.test(text)
}

function isProjectNarrativeQuestion(questionText) {
  return /\b(project|experience|challenge)\b/i.test(questionText)
    || /(经历|挑战|贡献|介绍.*项目|做过|项目里|你负责什么|个人贡献)/i.test(questionText)
}

function isSpecificKnowledgeQuestion(questionText) {
  if (isProjectNarrativeQuestion(questionText)) {
    return false
  }
  return /(what is|what are|explain|difference between|how do you|why|compare|tradeoff|when do you|how would you|design|architecture|system|evaluate|评估|如何|什么是|区别|原理|为什么|选型|架构|设计)/i.test(questionText)
}

function scoreDomainCompatibility(questionText, candidateText) {
  const questionProfile = detectDomainProfile(questionText, 'question')
  const candidateProfile = detectDomainProfile(candidateText, 'candidate')

  if (isProjectNarrativeQuestion(questionText)) {
    return candidateProfile.totalHits > 0 ? 0.06 : 0
  }

  if (questionProfile.totalHits === 0) {
    return 0
  }

  const overlaps = DOMAIN_FAMILIES
    .map((family) => ({
      candidateHits: candidateProfile.scores[family.name] ?? 0,
      name: family.name,
      questionHits: questionProfile.scores[family.name] ?? 0
    }))
    .filter((item) => item.questionHits > 0 && item.candidateHits > 0)

  if (overlaps.length > 0) {
    let score = 0
    for (const overlap of overlaps) {
      score += 0.1
      score += Math.min(overlap.questionHits, 2) * 0.03
      score += Math.min(overlap.candidateHits, 3) * 0.03
    }
    if (questionProfile.primary && questionProfile.primary === candidateProfile.primary) {
      score += 0.06
    }
    return Number(Math.min(0.44, score).toFixed(4))
  }

  if (candidateProfile.totalHits === 0 || !questionProfile.primary || !candidateProfile.primary) {
    return 0
  }

  const questionFamily = DOMAIN_FAMILY_BY_NAME.get(questionProfile.primary)
  const candidateFamily = DOMAIN_FAMILY_BY_NAME.get(candidateProfile.primary)
  const sameGroup = questionFamily?.group === candidateFamily?.group
  const familyCompatibilityBonus = getFamilyCompatibilityBonus(questionProfile.primary, candidateProfile.primary)

  if (familyCompatibilityBonus > 0) {
    return Number(Math.min(0.22, familyCompatibilityBonus + (sameGroup ? 0.02 : 0)).toFixed(4))
  }

  if (sameGroup) {
    return isSpecificKnowledgeQuestion(questionText) ? -0.14 : -0.06
  }

  return isSpecificKnowledgeQuestion(questionText) ? -0.42 : -0.22
}

function scoreWorkGrounding(questionText, document, domainScore = 0) {
  const normalizedQuestion = questionText.toLowerCase()
  const normalizedContext = buildWorkScoringText(document).toLowerCase()
  const isFoundationalQuestion = /(what is|what are|explain|difference between|why|如何|什么是|区别|原理|概念)/i.test(normalizedQuestion)
  const isProjectQuestion = isProjectNarrativeQuestion(questionText)
  const promptQuestion = isPromptQuestion(normalizedQuestion)
  const agentMemoryQuestion = isAgentMemoryQuestion(normalizedQuestion)
  const servingQuestion = isLlmServingQuestion(normalizedQuestion)
  const hasPromptConceptSignal = /(llm|large language model|prompt engineering|system prompt|in-context learning|instruction following|few-shot|chain-of-thought|提示词|提示工程|系统提示|上下文|大模型)/i.test(normalizedContext)
  const hasPromptApplicationSignal = /(prompt|instruction|json format|prompt template|provide one or more points|generated|run <|run_|自然语言指令|示例命令|command)/i.test(normalizedContext)
  const hasAgentMemorySignal = hasAgentMemoryCandidateSignal(normalizedContext)
  const hasServingSignal = hasLlmServingCandidateSignal(normalizedContext)
  let score = 0

  if (document.project === '_overview') {
    score += 0.28
  }
  if (document.originKind === 'primary') {
    score += 0.08
  }
  if (document.originKind === 'work_root') {
    score += 0.12
  }
  if (document.originKind === 'supplemental') {
    score -= 0.26
  }
  if (/(^|\/)readme/i.test(document.relPath) || /(总览|overview|导读|index)/i.test(document.title)) {
    score += 0.14
  }
  if (['md', 'mdx', 'markdown'].includes(document.ext)) {
    score += 0.12
  } else if (document.ext === 'ipynb') {
    score += 0.08
  } else if (document.ext === 'pdf') {
    score -= 0.12
  }
  if (/(个人贡献|独立完成|作者之一|参与项目|成果\/状态|技术栈|适用场景|系统架构|项目总览|自然语言|多智能体|planner|executor|evaluator|workflow|pipeline)/i.test(normalizedContext)) {
    score += 0.12
  }
  if (promptQuestion && hasPromptConceptSignal && hasPromptApplicationSignal) {
    score += 0.24
  } else if (promptQuestion && hasPromptConceptSignal) {
    score += 0.14
  } else if (promptQuestion && hasPromptApplicationSignal) {
    score += 0.02
  }
  if (agentMemoryQuestion && hasAgentMemorySignal) {
    score += 0.24
  } else if (agentMemoryQuestion) {
    score -= 0.06
  }
  if (servingQuestion && hasServingSignal) {
    score += 0.22
  } else if (servingQuestion) {
    score -= /(robot|ros|moveit|teleop|grasp|机械臂|具身|控制)/i.test(normalizedContext) ? 0.18 : 0.08
  }

  if (isFoundationalQuestion && document.project === '_overview' && domainScore >= 0) {
    score += 0.08
  }
  if (isFoundationalQuestion && ['md', 'mdx', 'markdown'].includes(document.ext) && domainScore >= 0) {
    score += 0.04
  }
  if (/(what is|what are|explain|difference between|how do you evaluate|如何|是什么|区别|原理|评估)/i.test(normalizedQuestion) && document.ext === 'pdf') {
    score -= 0.14
  }
  if (isFoundationalQuestion && document.ext === 'pdf') {
    score -= 0.2
  }
  if (promptQuestion
    && document.ext === 'pdf'
    && domainScore >= 0.12
    && hasPromptConceptSignal) {
    score += 0.26
  }
  if (promptQuestion
    && /(robot|ros|moveit|teleop|grasp|机械臂|具身|控制)/i.test(normalizedContext)
    && !hasPromptConceptSignal) {
    score -= 0.12
  }
  if (servingQuestion && document.ext === 'pdf' && hasServingSignal) {
    score += 0.12
  }
  if (isProjectQuestion && /(个人贡献|独立完成|作者之一|参与项目)/i.test(normalizedContext)) {
    score += 0.18
  }

  if (/(llm|agent|rag|embedding|vector|function|tool|mcp|自然语言|多智能体|检索增强)/i.test(normalizedQuestion)
    && /(llm|agent|rag|embedding|vector|planner|executor|evaluator|vlm|自然语言|多智能体|检索增强)/i.test(normalizedContext)) {
    score += 0.18
  }
  if (/(robot|embodied|ros|moveit|simulation|urdf|teleop|control|policy|world model|机器人|具身|遥操作|仿真|控制)/i.test(normalizedQuestion)
    && /(robot|embodied|ros|moveit|simulation|urdf|teleop|control|policy|world model|机器人|具身|遥操作|仿真|控制)/i.test(normalizedContext)) {
    score += 0.18
  }
  if (/(evaluate|evaluation|benchmark|metric|judge|评估|指标|benchmark|选型)/i.test(normalizedQuestion)
    && /(evaluation|benchmark|metric|judge|generalization|success rate|评估|指标|泛化|成功率)/i.test(normalizedContext)) {
    score += 0.14
  }

  if (domainScore >= 0.12) {
    score += 0.16
  } else if (domainScore >= 0.04) {
    score += 0.08
  } else if (domainScore <= -0.28) {
    score -= 0.42
  } else if (domainScore <= -0.12) {
    score -= 0.22
  }

  return Number(Math.max(0, Math.min(1, score)).toFixed(4))
}

function scoreWorkChunkGrounding(questionText, chunk, domainScore = 0) {
  const normalizedQuestion = questionText.toLowerCase()
  const normalizedContext = buildWorkChunkScoringText(chunk).toLowerCase()
  const isFoundationalQuestion = /(what is|what are|explain|difference between|why|如何|什么是|区别|原理|概念)/i.test(normalizedQuestion)
  const promptQuestion = isPromptQuestion(normalizedQuestion)
  const agentMemoryQuestion = isAgentMemoryQuestion(normalizedQuestion)
  const servingQuestion = isLlmServingQuestion(normalizedQuestion)
  const hasPromptConceptSignal = /(llm|large language model|prompt engineering|system prompt|in-context learning|instruction following|few-shot|chain-of-thought|提示词|提示工程|系统提示|上下文|大模型)/i.test(normalizedContext)
  const hasPromptApplicationSignal = /(prompt|instruction|json format|prompt template|provide one or more points|generated|run <|run_|自然语言指令|示例命令|command)/i.test(normalizedContext)
  const hasAgentMemorySignal = hasAgentMemoryCandidateSignal(normalizedContext)
  const hasServingSignal = hasLlmServingCandidateSignal(normalizedContext)
  let score = 0.08

  if (chunk.project === '_overview') {
    score += 0.12
  }
  if (chunk.originKind === 'primary') {
    score += 0.08
  }
  if (chunk.originKind === 'work_root') {
    score += 0.1
  }
  if (['md', 'mdx', 'markdown'].includes(chunk.ext)) {
    score += 0.1
  } else if (chunk.ext === 'pdf') {
    score -= 0.08
  }
  if (/(readme|overview|总览|导读|架构|pipeline|workflow|个人贡献|成果|挑战|评估|实验)/i.test(normalizedContext)) {
    score += 0.12
  }
  if (promptQuestion && hasPromptConceptSignal && hasPromptApplicationSignal) {
    score += 0.22
  } else if (promptQuestion && hasPromptConceptSignal) {
    score += 0.14
  } else if (promptQuestion && hasPromptApplicationSignal) {
    score += 0.02
  }
  if (agentMemoryQuestion && hasAgentMemorySignal) {
    score += 0.2
  } else if (agentMemoryQuestion) {
    score -= 0.04
  }
  if (servingQuestion && hasServingSignal) {
    score += 0.18
  } else if (servingQuestion) {
    score -= /(robot|ros|moveit|teleop|grasp|机械臂|具身|控制)/i.test(normalizedContext) ? 0.16 : 0.08
  }
  if (isFoundationalQuestion && chunk.project === '_overview') {
    score += 0.06
  }
  if (domainScore >= 0.12) {
    score += 0.14
  } else if (domainScore >= 0.04) {
    score += 0.06
  } else if (domainScore <= -0.28) {
    score -= 0.32
  } else if (domainScore <= -0.12) {
    score -= 0.16
  }
  if (promptQuestion
    && chunk.ext === 'pdf'
    && domainScore >= 0.12
    && hasPromptConceptSignal) {
    score += 0.22
  }
  if (promptQuestion
    && /(robot|ros|moveit|teleop|grasp|机械臂|具身|控制)/i.test(normalizedContext)
    && !hasPromptConceptSignal) {
    score -= 0.1
  }
  if (servingQuestion && chunk.ext === 'pdf' && hasServingSignal) {
    score += 0.1
  }

  return Number(Math.max(0, Math.min(1, score)).toFixed(4))
}

function buildQuestionFingerprint(text) {
  const tokens = tokenizeQuestionFingerprint(text)

  return [...new Set(tokens)]
    .sort((left, right) => left.localeCompare(right, 'en'))
    .join(' ')
    .trim()
}

function tokenizeQuestionFingerprint(text) {
  return sanitizeQuestionFingerprintText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .split(/\s+/)
    .map((token) => normalizeFingerprintToken(token))
    .filter((token) => token && !QUESTION_FINGERPRINT_STOPWORDS.has(token))
}

function sanitizeQuestionFingerprintText(text) {
  return text
    .replace(/^[\s📌✅⭐❓🔥👉]+/u, '')
    .replace(/^q\s*\d+\s*[:：.\-]\s*/i, '')
    .replace(/^\|\s*q\s*\d+\s*\|\s*/i, '')
    .replace(/\|\s*\[answer\]\([^)]*\)\s*\|?/ig, '')
    .replace(/[（(][^()（）]{0,120}(?:e\.?\s*g\.?|for example|for instance|例如|比如)[^()（）]{0,120}[)）]/ig, ' ')
    .replace(/\btransformer model\b/g, 'transformer')
    .replace(/\btransformers\b/g, 'transformer')
    .replace(/\bmodels\b/g, 'model')
    .replace(/\bllms\b/g, 'llm')
}

function normalizeFingerprintToken(token) {
  if (!token) {
    return ''
  }

  if (token.length === 1 && /^[a-z]$/i.test(token)) {
    return ''
  }

  if (!/^[a-z0-9]+$/.test(token)) {
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

function areQuestionFingerprintsNearDuplicate(left, right) {
  if (!left || !right) {
    return false
  }
  if (left === right) {
    return true
  }

  const leftTokens = left.split(/\s+/).filter(Boolean)
  const rightTokens = right.split(/\s+/).filter(Boolean)
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return false
  }

  const leftSet = new Set(leftTokens)
  const rightSet = new Set(rightTokens)
  let overlap = 0
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      overlap += 1
    }
  }

  const shorter = Math.min(leftSet.size, rightSet.size)
  const union = new Set([...leftSet, ...rightSet]).size
  const shorterCoverage = overlap / shorter
  const jaccard = overlap / union

  return overlap >= 4 && shorterCoverage >= 0.9 && jaccard >= 0.72
}

function emitProgress(stage, progress, detail) {
  console.log(`[OfferLoomProgress] ${JSON.stringify({
    detail,
    progress,
    stage,
    timestamp: nowIso()
  })}`)
}

const INTENT_RULES = [
  {
    questionPatterns: ['how do you evaluate', 'evaluate the best', 'best llm model', 'model selection', 'use case', '选型', '选模型'],
    candidateKeywords: ['benchmark', 'benchmarks', 'metric', 'metrics', 'judge', 'arena', 'leaderboard', 'latency', 'throughput', 'cost', '维度', '指标', '基准', '评测', 'tradeoff']
  },
  {
    questionPatterns: ['difference between', 'what is the difference', 'vs ', ' tradeoff', 'compare', '区别', '优缺点'],
    candidateKeywords: ['difference', 'tradeoff', 'compare', 'when to use', 'latency', 'throughput', '区别', '优缺点', '吞吐', '时延']
  },
  {
    questionPatterns: ['how do you improve', 'mitigate', 'reduce', 'avoid', '缓解', '降低', '优化'],
    candidateKeywords: ['improve', 'mitigate', 'reduce', 'guardrail', '策略', '方案', '优化', '缓解']
  }
]

function scoreIntentAlignment(questionText, candidateText) {
  const normalizedQuestion = questionText.toLowerCase()
  const normalizedCandidate = candidateText.toLowerCase()
  let bestScore = 0

  for (const rule of INTENT_RULES) {
    const questionMatched = rule.questionPatterns.some((pattern) => normalizedQuestion.includes(pattern))
    if (!questionMatched) {
      continue
    }
    const candidateHits = countKeywordHits(normalizedCandidate, rule.candidateKeywords)
    if (candidateHits === 0) {
      continue
    }

    const score = Math.min(1, 0.45 + Math.min(candidateHits, 4) * 0.15)
    bestScore = Math.max(bestScore, Number(score.toFixed(4)))
  }

  return bestScore
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
