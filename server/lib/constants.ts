import path from 'node:path'

export const ROOT_DIR = process.cwd()
const DEFAULT_DB_PATH = path.join(ROOT_DIR, 'data', 'offerpotato.db')
const configuredDbPath = process.env.OFFERPOTATO_DB_PATH
export const DB_PATH = configuredDbPath
  ? path.resolve(ROOT_DIR, configuredDbPath)
  : DEFAULT_DB_PATH
export const WEB_DIST_DIR = path.join(ROOT_DIR, 'web', 'dist')
export const SKILLS_DIR = path.join(ROOT_DIR, 'skills')
export const SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'answer-package.schema.json')
export const CONSOLE_SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'codex-console.schema.json')
export const INTERVIEWER_SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'interviewer-mode.schema.json')
export const GENERATED_DIR = path.join(ROOT_DIR, 'data', 'generated')
export const SCRIPTS_DIR = path.join(ROOT_DIR, 'scripts')
export const DEFAULT_SOURCES_CONFIG_PATH = path.join(ROOT_DIR, 'config', 'sources.json')
export const RUNTIME_SOURCES_CONFIG_PATH = path.join(ROOT_DIR, 'config', 'sources.runtime.json')
export const DEFAULT_WORK_MANIFEST_PATH = path.join(ROOT_DIR, 'config', 'work-manifest.json')
export const RUNTIME_WORK_MANIFEST_PATH = path.join(ROOT_DIR, 'config', 'work-manifest.runtime.json')
export const LOCAL_SOURCES_ROOT = path.join(ROOT_DIR, 'sources')
export const LOCAL_GUIDE_SOURCES_ROOT = path.join(LOCAL_SOURCES_ROOT, 'documents')
export const LOCAL_QUESTION_BANK_SOURCES_ROOT = path.join(LOCAL_SOURCES_ROOT, 'question-banks')
export const AUTO_MYWORK_CANDIDATES = [
  path.join(ROOT_DIR, 'mywork'),
  path.resolve(ROOT_DIR, '..', '..', 'mywork')
]
export const PORT = Number(process.env.PORT ?? 6324)
