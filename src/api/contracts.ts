export const focusModes = [
  'GENERAL',
  'PACING',
  'WORLDBUILDING',
  'PROSE_STYLE',
] as const

export type FocusMode = (typeof focusModes)[number]

export const factEntityTypes = [
  'CHARACTER',
  'LOCATION',
  'ITEM',
  'FACTION',
  'WORLD_RULE',
  'EVENT',
] as const

export type FactEntityType = (typeof factEntityTypes)[number]

export type DiagnosticType =
  | 'CONTINUITY_BREAK'
  | 'SHOW_TELL_IMBALANCE'
  | 'PSYCHIC_DISTANCE_FILTER'
  | 'WEAK_CAUSALITY'
  | 'FORCED_EXPOSITION'
  | 'PROSE_MECHANICS'
  | 'WHITE_ROOM_SYNDROME'
  | 'OVERWRITING_CRUTCHES'
  | 'DIALOGUE_HOMOGENIZATION'

export type DiagnosticSeverity = 'CRITICAL' | 'WARNING' | 'NOTE'

export interface SlotStatus {
  openDiagnostics: number
  criticalDiagnostics: number
  pendingAlerts: number
  hasPendingFacts: boolean
  // Absent on backends that predate it; null means never analyzed.
  lastAnalyzedAt?: string | null
  openNotes?: number
}

export const noteKinds = ['NOTE', 'QUESTION', 'FIX', 'IDEA'] as const
export type NoteKind = (typeof noteKinds)[number]
export type NoteStatus = 'OPEN' | 'RESOLVED'

// A review note as stored: its text is encrypted with the project key.
export interface StoredNote {
  id: string
  projectId: string
  // null: a note about the whole project.
  slotId: string | null
  kind: NoteKind
  status: NoteStatus
  ciphertext: string
  iv: string
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Slot {
  id: string
  projectId: string
  title: string | null
  isUnanchored: boolean
  timelinePosition: number | null
  // Only present on project listings from backends that summarize review state.
  status?: SlotStatus
  // Scene group (act, journey stage…); only on project listings.
  groupId?: string | null
}

export const groupColors = ['sage', 'sky', 'amber', 'plum', 'teal', 'brick', 'slate', 'rose'] as const
export type GroupColor = (typeof groupColors)[number]

export interface SceneGroup {
  id: string
  projectId: string
  name: string
  color: GroupColor
  position: number
}

/** The encrypted style sheet, with the version a save must be based on. */
export interface StoredStyleSheet {
  ciphertext: string
  iv: string
  version: number
  updatedAt: string
}

/** An encrypted wiki document (templates or an entity page), versioned like the style sheet. */
export type StoredEncryptedDocument = StoredStyleSheet

/** Which entity has a wiki page, without its content. */
export interface EntityPageSummary {
  entityId: string
  version: number
  updatedAt: string
}

export interface SealedText {
  ciphertext: string
  iv: string
}

export interface Project {
  id: string
  title: string
}

export type ManuscriptImportStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'AWAITING_FINALIZATION'
  | 'COMPLETED'
  | 'FAILED'

export interface ManuscriptImportProgress {
  // Text blocks the PDF was split into; null until the PDF has been read.
  totalBlocks: number | null
  processedBlocks: number
  scenesFound: number
  startedAt: string | null
  // Imports ahead of this one while it waits.
  queuePosition: number | null
}

export interface ManuscriptImport {
  id: string
  projectId: string
  status: ManuscriptImportStatus
  // Absent on backends that don't report progress.
  progress?: ManuscriptImportProgress
  fileName: string
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

export interface ManuscriptImportScene {
  sequence: number
  title: string
  rawContent: string
}

export interface ManuscriptImportDetail extends ManuscriptImport {
  scenes?: ManuscriptImportScene[]
}

export interface CreateProjectSlot {
  title: string
  isUnanchored: boolean
  afterSlotId?: string
}

export interface PendingFact {
  entityName: string
  entityType: FactEntityType
  attribute: string
  value: string
  isSubjective: boolean
  sourceClaim?: string | null
  // Set when the value refers to another entity: the fact is a relation.
  targetEntityName?: string | null
  targetEntityType?: FactEntityType | null
}

export interface LinterDiagnostic {
  type: DiagnosticType
  severity: DiagnosticSeverity
  message: string
  sourceQuote: string
  correctionHint: string | null
  violatedFactId?: string | null
  signatureHash?: string
}

export interface LinterReport {
  slotId: string
  diagnostics: LinterDiagnostic[]
  pendingFacts: PendingFact[]
  analysisErrors: string[]
}

export type MacroDiagnosticType =
  | 'PACING_DRAG'
  | 'ABANDONED_PLOT_THREAD'
  | 'CHARACTER_ARC_FLATLINE'
  | 'STRUCTURAL_REPETITION'
  | 'THEMATIC_DISCONNECT'
  | 'CLIMAX_ANTI_RESONANCE'

export type MacroDiagnosticSeverity = 'CRITICAL' | 'WARNING' | 'ANOMALY'

export interface MacroDiagnostic {
  type: MacroDiagnosticType
  severity: MacroDiagnosticSeverity
  affectedScope: string
  clinicalSymptoms: string[]
  examples: string[]
}

export interface ArchitectReport {
  detectedFramework: string
  diagnostics: MacroDiagnostic[]
}

export type SceneBeat = 'SETUP' | 'RISING' | 'PEAK' | 'FALLING' | 'RELEASE'

/** Tension of one numbered scene, scored by the Arquiteto (0–10). */
export interface SceneMetric {
  scene: number
  evidence: string
  stakes: number
  opposition: number
  uncertainty: number
  tension: number
  beat: SceneBeat
}

/** A saved report, with the parameters it was generated from. */
export interface ArchitectReview extends ArchitectReport {
  id: string
  projectId: string
  genre: string
  narrativeFramework: string
  // Slot ids behind "Cena N" (N = index + 1); null on older reports.
  sceneIds?: string[] | null
  // Tension curve; null on reports generated before it existed.
  sceneMetrics?: SceneMetric[] | null
  createdAt: string
}

export interface ArchitectAnalysis {
  projectId: string
  genre: string
  narrativeFramework: string
  manuscript: string
  sceneIds?: string[]
}

export interface ProjectEncryption {
  passwordSalt: string
  passwordWrappedKey: string
  passwordWrapIv: string
  recoverySalt: string
  recoveryWrappedKey: string
  recoveryWrapIv: string
}

export interface EncryptedScene {
  ciphertext: string
  iv: string
  version: number
}

export type FactStatus = 'PENDING' | 'APPROVED' | 'NONE'

export interface SlotReview {
  content: EncryptedScene | null
  diagnostics: LinterDiagnostic[]
  facts: PendingFact[]
  factStatus: FactStatus
}

export interface Override {
  id: string
  slotId: string
  diagnosticSignatureHash: string
  justification: string
  status: 'INTENTIONAL'
}

export interface RegressionAlert {
  id: string
  sourceSlotId: string
  affectedSlotId: string
  status: 'PENDING' | 'ACKNOWLEDGED'
  acknowledgedAt: string | null
  createdAt: string
}

export interface TimelineMove {
  id: string
  slotId: string
  // null: the scene was (or ended up) outside the timeline
  fromPosition: number | null
  toPosition: number | null
  // Alerts the move created or reopened.
  alertIds: string[]
  createdAt: string
  undoneAt: string | null
}

export interface ReorderTimelineResult {
  affectedSlotIds: string[]
  // Absent on older backends; null when nothing changed.
  moveId?: string | null
}

export interface FactApprovalResult {
  slotId: string
  approvedFacts: number
  regressionAlerts: string[]
}

export interface SceneSubmission {
  projectId: string
  slotId: string
  rawContent: string
  genreOverride?: string
  focusMode: FocusMode
}

export interface ProjectFact {
  id: string
  attribute: string
  value: string
  isSubjective: boolean
  sourceClaim: string | null
  isActive: boolean
  entity: {
    id: string
    name: string
    type: string
    canonicalId: string | null
    canonical: { id: string; name: string } | null
  }
  // The entity the value refers to (a relation); absent on older backends.
  targetEntity?: FactTarget | null
  // Created by the author in the Arquivo; re-analysis leaves it alone.
  isManual?: boolean
  slot: Pick<Slot, 'id' | 'title' | 'isUnanchored' | 'timelinePosition'>
}

export interface CreateRelation {
  sourceEntityId: string
  targetEntityId: string
  slotId: string
  attribute: string
  value: string
  isSubjective: boolean
  sourceClaim?: string | null
}

export interface FactTarget {
  id: string
  name: string
  type: string
  canonicalId: string | null
}

/** An entity in the trash, restorable with its aliases and facts. */
export interface DeletedEntity {
  id: string
  name: string
  type: string
  aliases: string[]
  facts: number
  deletedAt: string
}

export interface EntityChange {
  // The canonical entity after the change.
  canonicalId: string
  affected: number
}

export interface ProjectEntity {
  id: string
  name: string
  type: string
  canonicalId: string | null
  aliases: Array<{ id: string; name: string }>
  facts: Array<Omit<ProjectFact, 'entity'>>
}

export interface SplitEntityResult {
  sourceEntityId: string
  createdEntities: Array<{ id: string; name: string; type: string }>
  facts: Array<{
    id: string
    entityId: string
    slotId: string
    attribute: string
    value: string
    isSubjective: boolean
    sourceClaim: string | null
    isActive: boolean
  }>
}

export interface AuthUser {
  id: string
  email: string
  name: string
  // Product tours finished or skipped; they don't start on their own again.
  completedTours: string[]
  role: 'USER' | 'ADMIN'
  // Opens the /marketing workspace; absent on backends that predate it.
  marketingEnabled?: boolean
}

export type InviteStatus = 'AVAILABLE' | 'USED' | 'REVOKED'

export interface AdminInvite {
  id: string
  code: string
  email: string | null
  note: string | null
  status: InviteStatus
  createdAt: string
  usedAt: string | null
  usedBy: { id: string; name: string; email: string } | null
  createdByName: string | null
  waitlistEntryId: string | null
}

export interface AdminWaitlistEntry {
  id: string
  name: string
  email: string
  message: string | null
  createdAt: string
  status: 'WAITING' | 'INVITED' | 'REGISTERED'
  invite: { id: string; code: string; status: InviteStatus } | null
}

export interface AdminUser {
  id: string
  name: string
  email: string
  role: 'USER' | 'ADMIN'
  createdAt: string
  projectCount: number
  lastProjectAccessAt: string | null
  wordsThisMonth: number
  monthlyWordLimit: number | null
  effectiveWordLimit: number
  marketingEnabled: boolean
}

// Each call the platform makes to a model; same names as the usage features.
export type LlmTask = UsageFeature

export interface AdminLlmModels {
  tasks: Array<{
    task: LlmTask
    model: string
    defaultModel: string
    // True while the task uses the server default from the env.
    isDefault: boolean
    updatedAt: string | null
  }>
  // Null when the server couldn't ask the provider for its list.
  availableModels: string[] | null
}

export interface AdminOverview {
  users: number
  newUsersThisMonth: number
  waitlistWaiting: number
  invitesAvailable: number
  invitesUsed: number
  wordsThisMonth: number
  projects: number
}

export interface AuthSession {
  accessToken: string
  user: AuthUser
}

// What reads the author's text and counts against the monthly allowance.
export type UsageFeature = 'IMPORT' | 'ARCHIVIST' | 'LINTER' | 'ARCHITECT' | 'MARKETING'

export interface UsageSummary {
  limit: number
  used: number
  remaining: number
  periodStart: string
  resetsAt: string
  byFeature: Record<UsageFeature, number>
}

export interface GoogleStatus {
  // False when the server has no Google OAuth client: the feature stays hidden.
  available: boolean
  connected: boolean
  email: string | null
  // The connection may write comments, not only read.
  canComment: boolean
}

export type GoogleHeadingLevel = 1 | 2 | 3

export interface GoogleDocLink {
  documentId: string
  title: string
  headingLevel: GoogleHeadingLevel
  sceneCount: number
  // Which scene each heading of the doc fills.
  sections: GoogleDocSectionLink[]
  lastSyncedAt: string | null
  lastCommentedAt: string | null
  url: string
}

export interface GoogleCommentItem {
  key: string
  headingKey: string | null
  quote: string | null
  content: string
}

export interface GoogleCommentSummary {
  created: number
  updated: number
  resolved: number
  unchanged: number
  unanchored: number
  closedInDoc: number
}

export interface GoogleDocSectionLink {
  headingKey: string
  slotId: string
}

export interface GoogleDocSync {
  upToDate: boolean
  revisionId: string
  title: string
  sections: Array<{ key: string; title: string; text: string }>
  sectionMap: GoogleDocSectionLink[]
}

// The identity kit as the model drafts it (see the marketing workspace).
export type QuoteUse = 'TAGLINE' | 'ATMOSPHERE' | 'VOICE' | 'ARTIFACT'

export interface MarketingDraft {
  essence: {
    setting: string
    era: string
    place: string
    culture: string
    scale: 'INTIMATE' | 'PERSONAL' | 'EPIC' | null
    pointOfView: string
  }
  mood: { words: string[]; temperature: 'WARM' | 'NEUTRAL' | 'COLD' | null; tempo: 'STILL' | 'FLOWING' | 'URGENT' | null; notes: string }
  palette: Array<{ name: string; hex: string; role: 'BACKGROUND' | 'SURFACE' | 'INK' | 'ACCENT' | 'HIGHLIGHT' | 'SHADOW'; reason: string }>
  typography: { display: string; body: string; accent: string; reason: string }
  materials: string[]
  light: string
  sound: string
  composition: string
  motifs: Array<{ name: string; meaning: string; entityName: string }>
  artifacts: Array<{
    kind: 'LETTER' | 'DIARY' | 'MAP' | 'CHAT' | 'PHOTO' | 'FILE' | 'BESTIARY' | 'RECIPE' | 'TICKET' | 'NEWSPAPER' | 'OBJECT' | 'OTHER'
    title: string
    entityName: string
    description: string
  }>
  // Checked by the server: each is in the public scene it names.
  quotes: Array<{ text: string; scene: number; use: QuoteUse; note: string }>
  avoid: string[]
  stylePrompt: string
  sampleLine: string
}

export interface MarketingDraftRequest {
  publicScenes: Array<{ order: number; title: string | null; text: string }>
  restrictedScenes: Array<{ text: string }>
  storyBible: string
  currentIdentity: string
}
