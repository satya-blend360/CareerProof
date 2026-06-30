import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  AuthGuard,
  useCreateRecord,
  useCurrentUser,
  useLiveRecords,
  useUpdateRecord,
  useWorkflowStart,
} from 'lemma-sdk/react'
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  FileText,
  Gauge,
  GraduationCap,
  Lightbulb,
  Mail,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  PlayCircle,
  Sparkles,
  Target,
  TimerReset,
  UserRound,
} from 'lucide-react'
import { lemmaClient } from './lemma-client'
import './styles.css'

type Row = Record<string, unknown>

type IntakeForm = {
  company: string
  roleTitle: string
  jobUrl: string
  jobDescription: string
  resumeContext: string
}

type ProfileForm = {
  fullName: string
  email: string
  degree: string
  graduationYear: string
  workAuthorization: string
  portfolioUrl: string
  githubUrl: string
  linkedinUrl: string
  targetRoles: string
  locationPreferences: string
  summary: string
}

type OutcomeForm = {
  outcome: string
  stageReached: string
  reason: string
  lessons: string
  patternTags: string
}

type InterviewResult = {
  score: number
  verdict: string
  notes: string[]
}

const queryClient = new QueryClient()
const podId = lemmaClient.podId
const MAX_JOB_DESCRIPTION_CHARS = 20000
const MAX_RESUME_CONTEXT_CHARS = 12000
const TERMINAL_WORKFLOW_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'CANCELED'])

const initialForm: IntakeForm = {
  company: '',
  roleTitle: '',
  jobUrl: '',
  jobDescription: '',
  resumeContext: '',
}

const initialProfileForm: ProfileForm = {
  fullName: '',
  email: '',
  degree: '',
  graduationYear: '',
  workAuthorization: '',
  portfolioUrl: '',
  githubUrl: '',
  linkedinUrl: '',
  targetRoles: '',
  locationPreferences: '',
  summary: '',
}

const initialOutcomeForm: OutcomeForm = {
  outcome: 'interview',
  stageReached: '',
  reason: '',
  lessons: '',
  patternTags: '',
}

const outcomeStatusMap: Record<string, string> = {
  rejected: 'rejected',
  interview: 'interview',
  offer: 'offer',
  ghosted: 'ghosted',
  withdrew: 'skipped',
}

function value(row: Row | null | undefined, key: string): unknown {
  if (!row) return undefined
  if (key in row) return row[key]
  const values = row.values
  if (values && typeof values === 'object' && key in values) {
    return (values as Row)[key]
  }
  return undefined
}

function text(row: Row | null | undefined, key: string, fallback = ''): string {
  const raw = value(row, key)
  if (raw === null || raw === undefined) return fallback
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
  return fallback
}

function num(row: Row | null | undefined, key: string): number | null {
  const raw = value(row, key)
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function rowId(row: Row | null | undefined): string {
  return text(row, 'id')
}

function timestamp(row: Row, key: string): number {
  const parsed = Date.parse(text(row, key))
  return Number.isFinite(parsed) ? parsed : 0
}

function sortLatest(rows: Row[]): Row[] {
  return [...rows].sort((left, right) => {
    const rightTime = timestamp(right, 'updated_at') || timestamp(right, 'created_at')
    const leftTime = timestamp(left, 'updated_at') || timestamp(left, 'created_at')
    return rightTime - leftTime
  })
}

function sameApplication(row: Row, applicationId: string): boolean {
  return text(row, 'application_id') === applicationId
}

function asList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
    } catch {
      return raw.split('\n').map((item) => item.trim()).filter(Boolean)
    }
  }
  return []
}

function compactList(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function listText(raw: unknown): string {
  return asList(raw).join(', ')
}

function integerOrNull(input: string): number | null {
  if (!input.trim()) return null
  const parsed = Number(input)
  return Number.isInteger(parsed) ? parsed : null
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function requirementRank(row: Row): number {
  const importance = text(row, 'importance')
  if (importance === 'high') return 0
  if (importance === 'medium') return 1
  return 2
}

function outcomeTone(outcome: string): string {
  if (['offer', 'interview'].includes(outcome)) return 'good'
  if (['rejected', 'ghosted', 'withdrew'].includes(outcome)) return 'muted'
  return 'neutral'
}

function strengthRank(strength: string): number {
  if (['strong', 'verified'].includes(strength)) return 0
  if (['medium', 'credible'].includes(strength)) return 1
  if (['weak'].includes(strength)) return 2
  return 3
}

function matrixTone(strength: string): string {
  if (['strong', 'verified', 'credible'].includes(strength)) return 'good'
  if (['medium', 'weak'].includes(strength)) return 'warn'
  return 'muted'
}

function uniqueList(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))
}

function answerTerms(textValue: string): string[] {
  return uniqueList(textValue.toLowerCase().match(/[a-z0-9+#.]{3,}/g) ?? [])
}

function scoreInterviewAnswer(answer: string, proofTerms: string[], weakAreas: string[]): InterviewResult {
  const answerWords = new Set(answerTerms(answer))
  const normalizedProofTerms = uniqueList(proofTerms.flatMap((term) => answerTerms(term)))
  const normalizedWeakAreas = uniqueList(weakAreas.flatMap((term) => answerTerms(term)))
  const proofHits = normalizedProofTerms.filter((term) => answerWords.has(term)).slice(0, 8)
  const weakHits = normalizedWeakAreas.filter((term) => answerWords.has(term)).slice(0, 6)
  const lengthScore = Math.min(24, Math.floor(answer.trim().length / 18))
  const proofScore = Math.min(48, proofHits.length * 8)
  const riskPenalty = Math.min(28, weakHits.length * 7)
  const score = Math.max(0, Math.min(100, 28 + lengthScore + proofScore - riskPenalty))
  const notes = [
    proofHits.length ? 'Grounded in proof: ' + proofHits.join(', ') : 'Add at least one concrete project, metric, or artifact from the proof ledger.',
    weakHits.length ? 'Risky unsupported terms: ' + weakHits.join(', ') : 'No obvious weak-area terms were detected.',
    answer.trim().length < 220 ? 'The answer is short. Add situation, action, result, and proof.' : 'Answer has enough substance for a first pass.',
  ]
  const verdict = score >= 78 ? 'Defensible' : score >= 58 ? 'Needs one stronger proof hook' : 'Fix before interview'
  return { score, verdict, notes }
}

function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function labelize(valueText: string): string {
  if (!valueText) return 'Not set'
  return valueText
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function scoreLabel(score: number | null): string {
  return score === null ? '-' : `${score}%`
}

function statusClass(status: string): string {
  const normalized = status.toLowerCase()
  if (['ready_to_apply', 'applied', 'offer', 'interview', 'completed', 'open'].includes(normalized)) return 'good'
  if (['fix_first', 'referral_requested', 'analyzing', 'running', 'waiting', 'reconnecting', 'connecting'].includes(normalized)) return 'warn'
  if (['rejected', 'ghosted', 'skipped', 'failed', 'cancelled', 'canceled', 'closed'].includes(normalized)) return 'muted'
  return 'neutral'
}

function pickLatest(rows: Row[], table: string, applicationId: string): Row[] {
  if (!applicationId) return []
  return sortLatest(rows.filter((row) => sameApplication(row, applicationId))).slice(0, table === 'tasks' ? 8 : 4)
}

function isHttpUrl(rawUrl: string): boolean {
  if (!rawUrl.trim()) return true
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function validateIntake(formValue: IntakeForm): string | null {
  const jobDescription = formValue.jobDescription.trim()
  if (!jobDescription) return 'Paste the job description before running strategy.'
  if (jobDescription.length > MAX_JOB_DESCRIPTION_CHARS) return `Job description must be ${MAX_JOB_DESCRIPTION_CHARS.toLocaleString()} characters or less.`
  if (formValue.resumeContext.length > MAX_RESUME_CONTEXT_CHARS) return `Resume/profile context must be ${MAX_RESUME_CONTEXT_CHARS.toLocaleString()} characters or less.`
  if (!isHttpUrl(formValue.jobUrl.trim())) return 'Use a valid http or https job URL, or leave the field blank.'
  return null
}

function workflowNode(run: Row | null): string {
  return text(run, 'current_node_id') || text(run, 'failed_node_id') || 'Not started'
}

function isTerminalWorkflowStatus(status: string): boolean {
  return TERMINAL_WORKFLOW_STATUSES.has(status.toUpperCase())
}

function EmptyState({ title }: { title: string }) {
  return <p className="empty-state">{title}</p>
}

function Metric({ icon, label, valueText }: { icon: React.ReactNode; label: string; valueText: string }) {
  return (
    <div className="metric">
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{valueText}</strong>
      </div>
    </div>
  )
}

function SectionHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="section-header">
      <div>
        {icon}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  )
}

function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`pill ${tone}`}>{children}</span>
}

function App() {
  const { user } = useCurrentUser({ client: lemmaClient })
  const [form, setForm] = useState<IntakeForm>(initialForm)
  const [profileForm, setProfileForm] = useState<ProfileForm>(initialProfileForm)
  const [outcomeForm, setOutcomeForm] = useState<OutcomeForm>(initialOutcomeForm)
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [handledRunId, setHandledRunId] = useState('')
  const [interviewQuestion, setInterviewQuestion] = useState('')
  const [interviewAnswer, setInterviewAnswer] = useState('')
  const [interviewResult, setInterviewResult] = useState<InterviewResult | null>(null)
  const [isSeedingDemo, setIsSeedingDemo] = useState(false)

  const applicationsQuery = useLiveRecords<Row>({ client: lemmaClient, podId, tableName: 'applications', limit: 100, reconcile: 'merge' })
  const requirementsQuery = useLiveRecords<Row>({ client: lemmaClient, podId, tableName: 'job_requirements', limit: 200, reconcile: 'merge' })
  const evidenceQuery = useLiveRecords<Row>({ client: lemmaClient, podId, tableName: 'evidence_items', limit: 100, reconcile: 'merge' })
  const matchesQuery = useLiveRecords<Row>({ client: lemmaClient, podId, tableName: 'evidence_matches', limit: 100, reconcile: 'merge' })
  const sprintsQuery = useLiveRecords<Row>({ client: lemmaClient, podId, tableName: 'gap_sprints', limit: 100, reconcile: 'merge' })
  const deltasQuery = useLiveRecords<Row>({ client: lemmaClient, podId, tableName: 'resume_deltas', limit: 100, reconcile: 'merge' })
  const messagesQuery = useLiveRecords<Row>({ client: lemmaClient, podId, tableName: 'recruiter_messages', limit: 100, reconcile: 'merge' })
  const interviewsQuery = useLiveRecords<Row>({ client: lemmaClient, podId, tableName: 'interview_packs', limit: 100, reconcile: 'merge' })
  const tasksQuery = useLiveRecords<Row>({ client: lemmaClient, podId, tableName: 'tasks', limit: 100, reconcile: 'merge' })
  const skillsQuery = useLiveRecords<Row>({ client: lemmaClient, podId, tableName: 'skills', limit: 150, reconcile: 'merge' })
  const profileQuery = useLiveRecords<Row>({ client: lemmaClient, podId, tableName: 'student_profile', limit: 10, reconcile: 'merge' })
  const outcomesQuery = useLiveRecords<Row>({ client: lemmaClient, podId, tableName: 'outcomes', limit: 100, reconcile: 'merge' })

  const createApplication = useCreateRecord<Row>({ client: lemmaClient, podId, tableName: 'applications' })
  const createRequirement = useCreateRecord<Row>({ client: lemmaClient, podId, tableName: 'job_requirements' })
  const createEvidence = useCreateRecord<Row>({ client: lemmaClient, podId, tableName: 'evidence_items' })
  const createMatch = useCreateRecord<Row>({ client: lemmaClient, podId, tableName: 'evidence_matches' })
  const createSprint = useCreateRecord<Row>({ client: lemmaClient, podId, tableName: 'gap_sprints' })
  const createDelta = useCreateRecord<Row>({ client: lemmaClient, podId, tableName: 'resume_deltas' })
  const createMessage = useCreateRecord<Row>({ client: lemmaClient, podId, tableName: 'recruiter_messages' })
  const createInterview = useCreateRecord<Row>({ client: lemmaClient, podId, tableName: 'interview_packs' })
  const createTask = useCreateRecord<Row>({ client: lemmaClient, podId, tableName: 'tasks' })
  const createSkill = useCreateRecord<Row>({ client: lemmaClient, podId, tableName: 'skills' })
  const createProfile = useCreateRecord<Row>({ client: lemmaClient, podId, tableName: 'student_profile' })
  const createOutcome = useCreateRecord<Row>({ client: lemmaClient, podId, tableName: 'outcomes' })
  const strategyWorkflow = useWorkflowStart({
    client: lemmaClient,
    podId,
    workflowName: 'new-application-strategy-workflow',
    autoPoll: true,
    pollIntervalMs: 2500,
  })

  const applications = useMemo(() => sortLatest(applicationsQuery.records), [applicationsQuery.records])
  const selectedApplication = useMemo(() => {
    if (!applications.length) return null
    return applications.find((row) => rowId(row) === selectedId) ?? applications[0]
  }, [applications, selectedId])

  const activeApplicationId = rowId(selectedApplication)
  const profileRecord = useMemo(() => sortLatest(profileQuery.records)[0] ?? null, [profileQuery.records])
  const profileRecordId = rowId(profileRecord)
  const relatedRequirements = useMemo(() => {
    return requirementsQuery.records
      .filter((row) => sameApplication(row, activeApplicationId))
      .sort((left, right) => requirementRank(left) - requirementRank(right) || timestamp(right, 'created_at') - timestamp(left, 'created_at'))
  }, [requirementsQuery.records, activeApplicationId])
  const relatedOutcomes = useMemo(() => pickLatest(outcomesQuery.records, 'outcomes', activeApplicationId), [outcomesQuery.records, activeApplicationId])
  const skillRows = useMemo(() => sortLatest(skillsQuery.records), [skillsQuery.records])
  const strongestSkills = skillRows.filter((row) => ['strong', 'medium'].includes(text(row, 'strength'))).slice(0, 8)
  const weakSkills = skillRows.filter((row) => ['weak', 'missing'].includes(text(row, 'strength'))).slice(0, 8)

  const updateApplication = useUpdateRecord<Row>({ client: lemmaClient, podId, tableName: 'applications', recordId: activeApplicationId || null, enabled: Boolean(activeApplicationId) })
  const updateProfile = useUpdateRecord<Row>({ client: lemmaClient, podId, tableName: 'student_profile', recordId: profileRecordId || null, enabled: Boolean(profileRecordId) })

  const workflowRun = strategyWorkflow.run as Row | null
  const workflowRunId = strategyWorkflow.runId || rowId(workflowRun)
  const workflowStatus = text(workflowRun, 'status')
  const tableError = [
    applicationsQuery.error,
    requirementsQuery.error,
    evidenceQuery.error,
    matchesQuery.error,
    sprintsQuery.error,
    deltasQuery.error,
    messagesQuery.error,
    interviewsQuery.error,
    tasksQuery.error,
    skillsQuery.error,
    profileQuery.error,
    outcomesQuery.error,
  ].find(Boolean)

  const relatedSprints = pickLatest(sprintsQuery.records, 'gap_sprints', activeApplicationId)
  const relatedDeltas = pickLatest(deltasQuery.records, 'resume_deltas', activeApplicationId)
  const relatedMessages = pickLatest(messagesQuery.records, 'recruiter_messages', activeApplicationId)
  const relatedInterviews = pickLatest(interviewsQuery.records, 'interview_packs', activeApplicationId)
  const relatedTasks = pickLatest(tasksQuery.records, 'tasks', activeApplicationId)
  const relatedMatches = activeApplicationId ? sortLatest(matchesQuery.records.filter((row) => sameApplication(row, activeApplicationId))) : []
  const evidenceById = useMemo(() => new Map(evidenceQuery.records.map((row) => [rowId(row), row])), [evidenceQuery.records])
  const matchesByRequirement = useMemo(() => {
    const next = new Map<string, Row>()
    sortLatest(relatedMatches)
      .sort((left, right) => strengthRank(text(left, 'match_strength')) - strengthRank(text(right, 'match_strength')))
      .forEach((match) => {
        const requirementId = text(match, 'requirement_id')
        if (requirementId && !next.has(requirementId)) next.set(requirementId, match)
      })
    return next
  }, [relatedMatches])
  const proofMatrixRows = useMemo(() => {
    return relatedRequirements.map((requirement, index) => {
      const requirementId = rowId(requirement)
      const match = matchesByRequirement.get(requirementId) ?? relatedMatches[index] ?? null
      const evidence = evidenceById.get(text(match, 'evidence_item_id')) ?? null
      const proofQuality = text(match, 'proof_quality', text(match, 'match_strength', 'missing'))
      const gapType = text(match, 'gap_type')
      const nextAction = proofQuality === 'verified' || proofQuality === 'credible'
        ? 'Use this proof in the recruiter message and interview story.'
        : gapType && gapType !== 'none'
          ? 'Run or finish a gap sprint for ' + labelize(gapType) + '.'
          : 'Add a concrete artifact, metric, or story before claiming this.'
      return { requirement, match, evidence, proofQuality, nextAction }
    })
  }, [relatedRequirements, matchesByRequirement, relatedMatches, evidenceById])
  const interviewQuestions = useMemo(() => {
    const packQuestions = relatedInterviews.flatMap((pack) => asList(value(pack, 'likely_questions')))
    const requirementQuestions = relatedRequirements.slice(0, 5).map((requirement) => 'Tell me how your background proves: ' + text(requirement, 'requirement_text'))
    return uniqueList([...packQuestions, ...requirementQuestions, 'Walk me through the strongest proof you have for this role.']).slice(0, 10)
  }, [relatedInterviews, relatedRequirements])
  const proofTerms = useMemo(() => {
    return evidenceQuery.records.flatMap((item) => [
      text(item, 'title'),
      text(item, 'description'),
      ...asList(value(item, 'skills_demonstrated')),
      text(item, 'story_result'),
    ])
  }, [evidenceQuery.records])
  const weakAreaTerms = useMemo(() => {
    return [
      ...weakSkills.map((skill) => text(skill, 'skill_name')),
      ...relatedInterviews.flatMap((pack) => asList(value(pack, 'weak_areas'))),
      ...proofMatrixRows.filter((row) => ['weak', 'missing'].includes(row.proofQuality)).map((row) => text(row.requirement, 'skill') || text(row.requirement, 'requirement_text')),
    ]
  }, [weakSkills, relatedInterviews, proofMatrixRows])

  const fixFirstCount = applications.filter((row) => text(row, 'decision') === 'fix_first' || text(row, 'status') === 'fix_first').length
  const readyCount = applications.filter((row) => ['apply', 'ready_to_apply', 'applied', 'interview'].includes(text(row, 'decision')) || ['ready_to_apply', 'applied', 'interview'].includes(text(row, 'status'))).length
  const openTaskCount = tasksQuery.records.filter((row) => text(row, 'status', 'open') !== 'done').length
  const highRequirementCount = relatedRequirements.filter((row) => text(row, 'importance') === 'high').length
  const proofGapCount = proofMatrixRows.filter((row) => ['weak', 'missing'].includes(row.proofQuality)).length
  const isSubmitting = createApplication.isSubmitting || strategyWorkflow.isStarting
  const isProfileSubmitting = createProfile.isSubmitting || updateProfile.isSubmitting
  const isOutcomeSubmitting = createOutcome.isSubmitting || updateApplication.isSubmitting

  function updateField(field: keyof IntakeForm, nextValue: string) {
    setForm((current) => ({ ...current, [field]: nextValue }))
  }

  function updateProfileField(field: keyof ProfileForm, nextValue: string) {
    setProfileForm((current) => ({ ...current, [field]: nextValue }))
  }

  function updateOutcomeField(field: keyof OutcomeForm, nextValue: string) {
    setOutcomeForm((current) => ({ ...current, [field]: nextValue }))
  }

  async function refreshAll() {
    await Promise.all([
      applicationsQuery.refresh(),
      requirementsQuery.refresh(),
      evidenceQuery.refresh(),
      matchesQuery.refresh(),
      sprintsQuery.refresh(),
      deltasQuery.refresh(),
      messagesQuery.refresh(),
      interviewsQuery.refresh(),
      tasksQuery.refresh(),
      skillsQuery.refresh(),
      profileQuery.refresh(),
      outcomesQuery.refresh(),
    ])
  }

  useEffect(() => {
    if (!workflowRunId || !workflowStatus || handledRunId === workflowRunId) return
    if (!isTerminalWorkflowStatus(workflowStatus)) return

    setHandledRunId(workflowRunId)
    void refreshAll()

    if (workflowStatus.toUpperCase() === 'COMPLETED') {
      setNotice('Strategy workflow completed. Live outputs are synced below.')
      return
    }

    setSubmitError('Strategy workflow ended as ' + labelize(workflowStatus) + ' at ' + workflowNode(workflowRun) + '. Review the run details before relying on this application output.')
  }, [handledRunId, workflowRun, workflowRunId, workflowStatus])

  useEffect(() => {
    if (!profileRecord) return
    setProfileForm({
      fullName: text(profileRecord, 'full_name'),
      email: text(profileRecord, 'email'),
      degree: text(profileRecord, 'degree'),
      graduationYear: text(profileRecord, 'graduation_year'),
      workAuthorization: text(profileRecord, 'work_authorization'),
      portfolioUrl: text(profileRecord, 'portfolio_url'),
      githubUrl: text(profileRecord, 'github_url'),
      linkedinUrl: text(profileRecord, 'linkedin_url'),
      targetRoles: listText(value(profileRecord, 'target_roles')),
      locationPreferences: listText(value(profileRecord, 'location_preferences')),
      summary: text(profileRecord, 'summary'),
    })
  }, [profileRecordId])

  async function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError('')
    setNotice('')

    const graduationYear = integerOrNull(profileForm.graduationYear)
    if (profileForm.graduationYear.trim() && graduationYear === null) {
      setSubmitError('Graduation year must be a whole number.')
      return
    }

    for (const [label, rawUrl] of [
      ['Portfolio URL', profileForm.portfolioUrl],
      ['GitHub URL', profileForm.githubUrl],
      ['LinkedIn URL', profileForm.linkedinUrl],
    ] as const) {
      if (!isHttpUrl(rawUrl.trim())) {
        setSubmitError(label + ' must be a valid http or https URL, or blank.')
        return
      }
    }

    const payload: Row = {
      full_name: profileForm.fullName.trim(),
      email: profileForm.email.trim(),
      degree: profileForm.degree.trim(),
      work_authorization: profileForm.workAuthorization.trim(),
      portfolio_url: profileForm.portfolioUrl.trim(),
      github_url: profileForm.githubUrl.trim(),
      linkedin_url: profileForm.linkedinUrl.trim(),
      target_roles: compactList(profileForm.targetRoles),
      location_preferences: compactList(profileForm.locationPreferences),
      summary: profileForm.summary.trim(),
    }
    if (graduationYear !== null) payload.graduation_year = graduationYear

    try {
      if (profileRecordId) {
        await updateProfile.update(payload, { recordId: profileRecordId })
      } else {
        await createProfile.create(payload)
      }
      setNotice('Profile saved. Future analyses can use this context.')
      await profileQuery.refresh()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error))
    }
  }

  async function submitOutcome(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError('')
    setNotice('')

    if (!activeApplicationId) {
      setSubmitError('Select an application before logging an outcome.')
      return
    }

    const outcome = outcomeForm.outcome
    const applicationUpdate: Row = {
      outcome: labelize(outcome),
    }
    const nextStatus = outcomeStatusMap[outcome]
    if (nextStatus) applicationUpdate.status = nextStatus

    try {
      await createOutcome.create({
        application_id: activeApplicationId,
        outcome,
        outcome_date: todayDate(),
        stage_reached: outcomeForm.stageReached.trim(),
        reason_if_known: outcomeForm.reason.trim(),
        lessons: outcomeForm.lessons.trim(),
        pattern_tags: compactList(outcomeForm.patternTags),
      })
      await updateApplication.update(applicationUpdate, { recordId: activeApplicationId })
      setOutcomeForm(initialOutcomeForm)
      setNotice('Outcome logged and the application status was updated.')
      await refreshAll()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error))
    }
  }


  function buildStrategyPack(): string {
    const application = selectedApplication
    const title = application ? text(application, 'role_title', 'Untitled role') + ' at ' + text(application, 'company', 'Unknown company') : 'CareerProof Strategy Pack'
    const lines = [
      '# CareerProof Strategy Pack',
      '',
      '## Application',
      '- Role: ' + title,
      '- Decision: ' + labelize(text(application, 'decision')),
      '- Status: ' + labelize(text(application, 'status')),
      '- Fit score: ' + scoreLabel(num(application, 'fit_score')),
      '- Credibility score: ' + scoreLabel(num(application, 'credibility_score')),
      '- Next action: ' + text(application, 'next_action', 'Not set'),
      '',
      '## Proof Matrix',
      ...proofMatrixRows.map((row, index) => {
        const evidenceTitle = row.evidence ? text(row.evidence, 'title', 'Untitled evidence') : 'No evidence attached'
        return [
          String(index + 1) + '. ' + text(row.requirement, 'requirement_text', 'Requirement'),
          '   - Importance: ' + labelize(text(row.requirement, 'importance')),
          '   - Proof: ' + labelize(row.proofQuality) + ' via ' + evidenceTitle,
          '   - Next action: ' + row.nextAction,
        ].join('\n')
      }),
      '',
      '## Gap Sprints',
      ...(relatedSprints.length ? relatedSprints.map((sprint) => '- ' + text(sprint, 'gap_summary') + ' (' + (text(sprint, 'estimated_hours') || '-') + 'h): ' + asList(value(sprint, 'sprint_steps')).join(' | ')) : ['- None yet.']),
      '',
      '## Resume Deltas',
      ...(relatedDeltas.length ? relatedDeltas.map((delta) => '- ' + text(delta, 'section') + ': ' + text(delta, 'suggested_text') + ' [' + labelize(text(delta, 'truth_status')) + ']') : ['- None yet.']),
      '',
      '## Recruiter Messages',
      ...(relatedMessages.length ? relatedMessages.map((message) => '- ' + labelize(text(message, 'channel')) + ': ' + text(message, 'message_body')) : ['- None yet.']),
      '',
      '## Interview Defense',
      ...(relatedInterviews.length ? relatedInterviews.flatMap((pack) => [
        '- Defense notes: ' + text(pack, 'defense_notes', 'Not set'),
        '- Likely questions: ' + asList(value(pack, 'likely_questions')).join(' | '),
      ]) : ['- None yet.']),
      '',
      '## Tasks',
      ...(relatedTasks.length ? relatedTasks.map((task) => '- ' + text(task, 'task_title') + ' [' + labelize(text(task, 'priority')) + ']') : ['- None yet.']),
    ]
    return lines.join('\n')
  }

  function exportStrategyPack() {
    if (!selectedApplication) {
      setSubmitError('Select or create an application before exporting a strategy pack.')
      return
    }
    const company = text(selectedApplication, 'company', 'careerproof').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'careerproof'
    downloadTextFile(company + '-strategy-pack.md', buildStrategyPack())
    setNotice('Strategy pack exported as Markdown.')
  }

  function runInterviewPractice() {
    const question = interviewQuestion || interviewQuestions[0] || 'Walk me through the strongest proof you have for this role.'
    if (!interviewAnswer.trim()) {
      setSubmitError('Write an interview answer before scoring it.')
      return
    }
    setSubmitError('')
    setInterviewQuestion(question)
    setInterviewResult(scoreInterviewAnswer(interviewAnswer, proofTerms, weakAreaTerms))
  }

  async function seedDemoApplication() {
    setSubmitError('')
    setNotice('')
    setIsSeedingDemo(true)
    try {
      if (!profileRecordId) {
        await createProfile.create({
          full_name: 'Maya Patel',
          email: user?.email ?? 'maya@example.com',
          target_roles: ['Backend intern', 'AI engineer intern'],
          graduation_year: 2027,
          degree: 'B.S. Computer Science',
          location_preferences: ['Remote', 'New York', 'Seattle'],
          work_authorization: 'F-1 CPT / OPT eligible',
          portfolio_url: 'https://example.com/maya',
          github_url: 'https://github.com/example-maya',
          linkedin_url: 'https://linkedin.com/in/example-maya',
          summary: 'CS student with API, data, and hackathon project experience. Strongest proof is a deployed FastAPI project with PostgreSQL and tests.',
        })
      }

      const application = await createApplication.create({
        company: 'Northstar Health AI',
        role_title: 'Backend AI Intern',
        status: 'fix_first',
        source: 'demo seed',
        job_url: 'https://example.com/backend-ai-intern',
        location: 'Remote',
        decision: 'fix_first',
        fit_score: 76,
        credibility_score: 61,
        next_action: 'Finish the PostgreSQL metrics gap sprint, then apply with the proof-backed recruiter message.',
        job_description: 'Backend AI internship requiring Python APIs, PostgreSQL, REST endpoints, testing, cloud deployment, Git, and clear communication with product teams.',
        notes: 'Seeded demo application for judging.',
      })
      const applicationId = rowId(application)
      setSelectedId(applicationId)

      const requirements = [] as Row[]
      for (const payload of [
        { requirement_text: 'Build and debug Python REST APIs', requirement_type: 'skill', importance: 'high', required_or_preferred: 'required', skill: 'Python APIs', seniority_signal: 'Owns endpoints and debugging rather than only coursework.', parsed_reason: 'The role centers on backend service work.' },
        { requirement_text: 'Use PostgreSQL or relational databases', requirement_type: 'tool', importance: 'high', required_or_preferred: 'required', skill: 'PostgreSQL', seniority_signal: 'Schema design and SQL debugging are expected.', parsed_reason: 'Database work is called out explicitly.' },
        { requirement_text: 'Write tests and document API behavior', requirement_type: 'responsibility', importance: 'medium', required_or_preferred: 'required', skill: 'Testing', seniority_signal: 'Shows production discipline.', parsed_reason: 'Intern must ship maintainable backend work.' },
        { requirement_text: 'Deploy a small cloud service', requirement_type: 'experience', importance: 'medium', required_or_preferred: 'preferred', skill: 'Cloud deployment', seniority_signal: 'Deployment proof separates project claims from tutorials.', parsed_reason: 'Cloud deployment is preferred but useful proof.' },
      ]) {
        requirements.push(await createRequirement.create({ application_id: applicationId, ...payload }) ?? {})
      }

      const evidence = [] as Row[]
      for (const payload of [
        { title: 'Campus Jobs API', type: 'project', description: 'Deployed FastAPI service with auth, PostgreSQL models, REST endpoints, Pytest coverage, and API docs.', skills_demonstrated: ['Python APIs', 'FastAPI', 'Testing', 'REST'], proof_url: 'https://example.com/campus-jobs-api', metrics: ['18 endpoints', '42 tests', '3 demo users'], strength: 'strong', weaknesses: 'Needs clearer database performance metric.', story_problem: 'Students needed one place to find campus jobs.', story_action: 'Built authenticated API and documented endpoints.', story_result: 'Demo supported saved searches and admin posting flow.' },
        { title: 'AI Resume Parser Hackathon', type: 'hackathon', description: 'Built a resume parser prototype and presented model limitations honestly.', skills_demonstrated: ['AI prototyping', 'Communication'], proof_url: 'https://example.com/resume-parser', metrics: ['Top 5 finalist'], strength: 'medium', weaknesses: 'Prototype was not deployed long-term.', story_problem: 'Teams needed fast resume screening.', story_action: 'Built extraction workflow and error review UI.', story_result: 'Judges praised clarity around model uncertainty.' },
      ]) {
        evidence.push(await createEvidence.create(payload) ?? {})
      }

      for (const payload of [
        { skill_name: 'Python APIs', category: 'technical', strength: 'strong', evidence_count: 1, best_evidence_item: 'Campus Jobs API', last_used_at: todayDate(), notes: 'Strong enough to claim with deployed project proof.' },
        { skill_name: 'PostgreSQL', category: 'tool', strength: 'weak', evidence_count: 1, best_evidence_item: 'Campus Jobs API', last_used_at: todayDate(), notes: 'Has schema usage, but needs a metric or query optimization story.' },
        { skill_name: 'Cloud deployment', category: 'tool', strength: 'medium', evidence_count: 1, best_evidence_item: 'Campus Jobs API', last_used_at: todayDate(), notes: 'Can discuss deployment, but should add monitoring or uptime proof.' },
      ]) {
        await createSkill.create(payload)
      }

      const reqId = (index: number) => rowId(requirements[index])
      const evId = (index: number) => rowId(evidence[index])
      for (const payload of [
        { requirement_id: reqId(0), evidence_item_id: evId(0), match_strength: 'strong', proof_quality: 'verified', gap_type: 'none', explanation: 'FastAPI project directly proves Python API design, debugging, tests, and documentation.' },
        { requirement_id: reqId(1), evidence_item_id: evId(0), match_strength: 'weak', proof_quality: 'weak', gap_type: 'missing_metric', explanation: 'Project uses PostgreSQL, but the current proof lacks query, schema, or performance metrics.' },
        { requirement_id: reqId(2), evidence_item_id: evId(0), match_strength: 'strong', proof_quality: 'credible', gap_type: 'none', explanation: 'Pytest coverage and docs are credible proof for testing discipline.' },
        { requirement_id: reqId(3), evidence_item_id: evId(0), match_strength: 'medium', proof_quality: 'credible', gap_type: 'missing_deployment', explanation: 'Deployment exists, but a public uptime/logging artifact would make it stronger.' },
      ]) {
        await createMatch.create({ application_id: applicationId, ...payload })
      }

      await createSprint.create({
        application_id: applicationId,
        gap_summary: 'Strengthen PostgreSQL proof before applying',
        estimated_hours: 6,
        sprint_steps: ['Add seed data and two realistic SQL queries', 'Capture before/after query timing', 'Write a short README section explaining schema tradeoffs', 'Add one screenshot or Loom walkthrough'],
        artifact_to_create: 'Database proof README with query metrics',
        resume_bullet_after_completion: 'Built a FastAPI/PostgreSQL jobs API with documented schema tradeoffs, tested endpoints, and measured query performance.',
        status: 'planned',
      })
      await createDelta.create({ application_id: applicationId, section: 'Projects', original_text: 'Built a campus jobs API.', suggested_text: 'Built a FastAPI campus jobs API with authenticated REST endpoints, PostgreSQL models, Pytest coverage, and API documentation.', reason: 'Supported by existing proof; avoid claiming database performance until the gap sprint is done.', evidence_item_id: evId(0), truth_status: 'supported' })
      await createMessage.create({ application_id: applicationId, recipient_type: 'recruiter', channel: 'linkedin', subject: 'Backend AI Intern application', message_body: 'Hi, I am applying for the Backend AI Intern role. My strongest fit is a deployed FastAPI jobs API with PostgreSQL models, tested endpoints, and API docs. I am strengthening the database proof with query metrics before submitting.', proof_hook: 'Campus Jobs API with REST, tests, and docs', status: 'draft' })
      await createInterview.create({ application_id: applicationId, likely_questions: ['Tell me about the API project you would use as proof for this role.', 'How did you design the PostgreSQL schema?', 'What would you improve before production?'], best_stories: ['Campus Jobs API: problem, endpoint design, tests, docs, deployment'], weak_areas: ['PostgreSQL performance metrics', 'cloud monitoring'], defense_notes: 'Lead with the API project. Be honest that database performance proof is in progress; explain the exact sprint plan.', technical_refresh_topics: ['SQL indexes', 'FastAPI dependency injection', 'Pytest fixtures'], questions_to_ask_interviewer: ['What backend services would the intern own first?', 'How do you evaluate AI feature reliability?'] })
      for (const payload of [
        { task_title: 'Add PostgreSQL query metric to Campus Jobs API README', task_type: 'gap_sprint', priority: 'high', status: 'open', notes: 'This closes the biggest proof gap.' },
        { task_title: 'Record 90-second API walkthrough', task_type: 'resume', priority: 'medium', status: 'open', notes: 'Attach as proof URL or portfolio link.' },
        { task_title: 'Send recruiter message after sprint artifact is ready', task_type: 'message', priority: 'medium', status: 'open', notes: 'Use the generated proof hook.' },
      ]) {
        await createTask.create({ application_id: applicationId, ...payload })
      }

      setNotice('Demo application loaded with proof matrix, gap sprint, resume delta, message, interview pack, and tasks.')
      await refreshAll()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsSeedingDemo(false)
    }
  }

  async function submitJob(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError('')
    setNotice('')

    const validationError = validateIntake(form)
    if (validationError) {
      setSubmitError(validationError)
      return
    }

    try {
      const company = form.company.trim() || 'Unknown company'
      const roleTitle = form.roleTitle.trim() || 'Untitled role'
      const created = await createApplication.create({
        company,
        role_title: roleTitle,
        status: 'analyzing',
        source: 'manual',
        job_url: form.jobUrl.trim(),
        job_description: form.jobDescription.trim(),
        notes: form.resumeContext.trim() ? 'Resume context provided in workflow intake.' : '',
      })
      const applicationId = rowId(created)
      if (applicationId) setSelectedId(applicationId)

      await strategyWorkflow.start({
        application_id: applicationId,
        company,
        role_title: roleTitle,
        job_url: form.jobUrl.trim(),
        job_description: form.jobDescription.trim(),
        resume_context: form.resumeContext.trim(),
      })

      setNotice('Strategy workflow started. Live outputs will appear as the agents write records.')
      setForm(initialForm)
      await refreshAll()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          <ShieldCheck size={24} />
          <div>
            <strong>CareerProof</strong>
            <span>Proof-backed strategy</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="CareerProof sections">
          <a href="#dashboard"><Gauge size={17} />Dashboard</a>
          <a href="#profile"><UserRound size={17} />Profile</a>
          <a href="#analyze"><Sparkles size={17} />Analyze</a>
          <a href="#requirements"><BarChart3 size={17} />Proof matrix</a>
          <a href="#proof"><ShieldCheck size={17} />Proof ledger</a>
          <a href="#interview"><MessageSquareText size={17} />Interview</a>
          <a href="#outcomes"><GraduationCap size={17} />Outcomes</a>
        </nav>
        <div className="user-chip">
          <span>Signed in</span>
          <strong>{user?.email ?? 'Lemma user'}</strong>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar" id="dashboard">
          <div>
            <p className="eyebrow">CareerProof</p>
            <h1>Application strategy centre</h1>
          </div>
          <div className="topbar-actions">
            <Pill tone={statusClass(applicationsQuery.liveStatus)}>Live {labelize(applicationsQuery.liveStatus)}</Pill>
            <button className="icon-button" type="button" onClick={() => void seedDemoApplication()} disabled={isSeedingDemo} aria-label="Load demo data">
              <Database size={18} />
              {isSeedingDemo ? 'Loading demo' : 'Load demo'}
            </button>
            <button className="icon-button" type="button" onClick={exportStrategyPack} disabled={!selectedApplication} aria-label="Export strategy pack">
              <Download size={18} />
              Export pack
            </button>
            <button className="icon-button" type="button" onClick={() => void refreshAll()} aria-label="Refresh data">
              <RefreshCw size={18} />
              Refresh
            </button>
          </div>
        </header>

        {tableError ? <div className="alert danger">Data sync error: {tableError.message}</div> : null}
        {strategyWorkflow.error ? <div className="alert danger">Workflow error: {strategyWorkflow.error.message}</div> : null}

        <section className="metrics-grid">
          <Metric icon={<BriefcaseBusiness size={19} />} label="Applications" valueText={String(applications.length)} />
          <Metric icon={<BarChart3 size={19} />} label="High requirements" valueText={String(highRequirementCount)} />
          <Metric icon={<ShieldCheck size={19} />} label="Proof gaps" valueText={String(proofGapCount)} />
          <Metric icon={<TimerReset size={19} />} label="Fix first" valueText={String(fixFirstCount)} />
          <Metric icon={<CheckCircle2 size={19} />} label="Ready" valueText={String(readyCount)} />
          <Metric icon={<ClipboardList size={19} />} label="Open tasks" valueText={String(openTaskCount)} />
        </section>

        <section className="two-column" id="profile">
          <form className="panel profile-panel" onSubmit={(event) => void submitProfile(event)}>
            <SectionHeader icon={<UserRound size={18} />} title="Student profile" />
            <div className="form-grid">
              <label>
                Full name
                <input value={profileForm.fullName} onChange={(event) => updateProfileField('fullName', event.target.value)} placeholder="Maya Patel" />
              </label>
              <label>
                Email
                <input type="email" value={profileForm.email} onChange={(event) => updateProfileField('email', event.target.value)} placeholder="maya@example.com" />
              </label>
              <label>
                Degree
                <input value={profileForm.degree} onChange={(event) => updateProfileField('degree', event.target.value)} placeholder="B.S. Computer Science" />
              </label>
              <label>
                Graduation year
                <input inputMode="numeric" value={profileForm.graduationYear} onChange={(event) => updateProfileField('graduationYear', event.target.value)} placeholder="2027" />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Work authorization
                <input value={profileForm.workAuthorization} onChange={(event) => updateProfileField('workAuthorization', event.target.value)} placeholder="F-1 CPT / OPT" />
              </label>
              <label>
                Target roles
                <input value={profileForm.targetRoles} onChange={(event) => updateProfileField('targetRoles', event.target.value)} placeholder="Backend intern, AI engineer" />
              </label>
            </div>
            <label>
              Location preferences
              <input value={profileForm.locationPreferences} onChange={(event) => updateProfileField('locationPreferences', event.target.value)} placeholder="Remote, New York, Seattle" />
            </label>
            <div className="form-grid">
              <label>
                Portfolio URL
                <input type="url" value={profileForm.portfolioUrl} onChange={(event) => updateProfileField('portfolioUrl', event.target.value)} placeholder="https://..." />
              </label>
              <label>
                GitHub URL
                <input type="url" value={profileForm.githubUrl} onChange={(event) => updateProfileField('githubUrl', event.target.value)} placeholder="https://github.com/..." />
              </label>
            </div>
            <label>
              LinkedIn URL
              <input type="url" value={profileForm.linkedinUrl} onChange={(event) => updateProfileField('linkedinUrl', event.target.value)} placeholder="https://linkedin.com/in/..." />
            </label>
            <label>
              Summary
              <textarea value={profileForm.summary} onChange={(event) => updateProfileField('summary', event.target.value)} placeholder="A concise profile summary the strategy agents can trust." rows={5} />
            </label>
            <button className="primary-action" type="submit" disabled={isProfileSubmitting}>
              <UserRound size={18} />
              {isProfileSubmitting ? 'Saving profile' : profileRecordId ? 'Update profile' : 'Save profile'}
            </button>
          </form>

          <section className="panel skill-panel">
            <SectionHeader icon={<GraduationCap size={18} />} title="Skill proof map" />
            {!skillRows.length ? <EmptyState title="Skills will appear as evidence is mined and strategies run." /> : null}
            {strongestSkills.length ? <h3 className="compact-heading">Supported strengths</h3> : null}
            <div className="chip-list">
              {strongestSkills.map((skill) => (
                <span className="skill-chip" key={rowId(skill) || text(skill, 'skill_name')}>
                  <strong>{text(skill, 'skill_name', 'Skill')}</strong>
                  <Pill tone={statusClass(text(skill, 'strength'))}>{labelize(text(skill, 'strength'))}</Pill>
                </span>
              ))}
            </div>
            {weakSkills.length ? <h3 className="compact-heading">Needs proof</h3> : null}
            <div className="record-stack">
              {weakSkills.map((skill) => (
                <article className="record-item" key={rowId(skill) || text(skill, 'skill_name')}>
                  <div className="record-title">
                    <strong>{text(skill, 'skill_name', 'Skill')}</strong>
                    <Pill tone="warn">{labelize(text(skill, 'strength'))}</Pill>
                  </div>
                  <p>{text(skill, 'notes', 'Add proof or run a gap sprint before claiming this strongly.')}</p>
                </article>
              ))}
            </div>
          </section>
        </section>

        <section className="two-column" id="analyze">
          <form className="panel intake-panel" onSubmit={(event) => void submitJob(event)}>
            <SectionHeader icon={<Sparkles size={18} />} title="New job analysis" />
            <div className="form-grid">
              <label>
                Company
                <input value={form.company} onChange={(event) => updateField('company', event.target.value)} placeholder="Acme" />
              </label>
              <label>
                Role title
                <input value={form.roleTitle} onChange={(event) => updateField('roleTitle', event.target.value)} placeholder="Backend intern" />
              </label>
            </div>
            <label>
              Job URL
              <input type="url" value={form.jobUrl} onChange={(event) => updateField('jobUrl', event.target.value)} placeholder="https://..." />
            </label>
            <label>
              <span className="field-row">
                <span>Resume/profile context</span>
                <span className="field-meta">{form.resumeContext.length.toLocaleString()} / {MAX_RESUME_CONTEXT_CHARS.toLocaleString()}</span>
              </span>
              <textarea maxLength={MAX_RESUME_CONTEXT_CHARS} value={form.resumeContext} onChange={(event) => updateField('resumeContext', event.target.value)} placeholder="Paste resume bullets, project notes, or target role context." rows={5} />
            </label>
            <label>
              <span className="field-row">
                <span>Job description</span>
                <span className="field-meta">{form.jobDescription.length.toLocaleString()} / {MAX_JOB_DESCRIPTION_CHARS.toLocaleString()}</span>
              </span>
              <textarea className="jd-box" maxLength={MAX_JOB_DESCRIPTION_CHARS} value={form.jobDescription} onChange={(event) => updateField('jobDescription', event.target.value)} placeholder="Paste the full job description." rows={9} />
            </label>
            {submitError ? <div className="alert danger">{submitError}</div> : null}
            {notice ? <div className="alert success">{notice}</div> : null}
            <button className="primary-action" type="submit" disabled={isSubmitting}>
              <Sparkles size={18} />
              {isSubmitting ? 'Starting strategy' : 'Run strategy'}
            </button>
          </form>

          <section className="panel strategy-panel">
            <SectionHeader icon={<Target size={18} />} title="Selected strategy" />
            {selectedApplication ? (
              <div className="strategy-summary">
                <div>
                  <h3>{text(selectedApplication, 'role_title', 'Untitled role')}</h3>
                  <p>{text(selectedApplication, 'company', 'Unknown company')}</p>
                </div>
                <div className="decision-row">
                  <Pill tone={statusClass(text(selectedApplication, 'status'))}>{labelize(text(selectedApplication, 'status'))}</Pill>
                  <Pill tone="accent">{labelize(text(selectedApplication, 'decision'))}</Pill>
                </div>
                <div className="score-row">
                  <div>
                    <span>Fit</span>
                    <strong>{scoreLabel(num(selectedApplication, 'fit_score'))}</strong>
                  </div>
                  <div>
                    <span>Credibility</span>
                    <strong>{scoreLabel(num(selectedApplication, 'credibility_score'))}</strong>
                  </div>
                </div>
                <div className="next-action">
                  <span>Next action</span>
                  <p>{text(selectedApplication, 'next_action', 'Waiting for workflow output.')}</p>
                </div>
                {workflowRunId ? (
                  <div className="workflow-status">
                    <div>
                      <span>Latest workflow</span>
                      <strong>{labelize(workflowStatus || 'starting')}</strong>
                    </div>
                    <div>
                      <span>Current node</span>
                      <strong>{workflowNode(workflowRun)}</strong>
                    </div>
                    {strategyWorkflow.isPolling ? <Pill tone="warn">Watching run</Pill> : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState title="No applications yet." />
            )}
          </section>
        </section>

        <section className="panel">
          <SectionHeader icon={<BriefcaseBusiness size={18} />} title="Application pipeline" />
          {applicationsQuery.isLoading ? <EmptyState title="Loading applications." /> : null}
          {!applicationsQuery.isLoading && !applications.length ? <EmptyState title="Add the first job to start the pipeline." /> : null}
          <div className="pipeline-list">
            {applications.map((application) => {
              const id = rowId(application)
              const active = id === activeApplicationId
              return (
                <button key={id || `${text(application, 'company')}-${text(application, 'role_title')}`} className={`pipeline-item ${active ? 'active' : ''}`} type="button" onClick={() => setSelectedId(id)}>
                  <div>
                    <strong>{text(application, 'role_title', 'Untitled role')}</strong>
                    <span>{text(application, 'company', 'Unknown company')}</span>
                  </div>
                  <div className="pipeline-meta">
                    <Pill tone={statusClass(text(application, 'status'))}>{labelize(text(application, 'status'))}</Pill>
                    <ArrowRight size={17} />
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="panel" id="requirements">
          <SectionHeader
            icon={<BarChart3 size={18} />}
            title="Proof matrix"
            action={
              <button className="icon-button" type="button" onClick={exportStrategyPack} disabled={!selectedApplication}>
                <Download size={17} />
                Export pack
              </button>
            }
          />
          {!proofMatrixRows.length ? <EmptyState title="Run strategy or load the demo to see requirements mapped to evidence, gaps, and next actions." /> : null}
          <div className="matrix-list">
            {proofMatrixRows.map((row) => (
              <article className="matrix-row" key={rowId(row.requirement) || text(row.requirement, 'requirement_text')}>
                <div className="matrix-cell requirement-cell">
                  <span>Requirement</span>
                  <strong>{text(row.requirement, 'requirement_text', 'Requirement')}</strong>
                  <div className="meta-row">
                    <Pill tone={text(row.requirement, 'importance') === 'high' ? 'warn' : 'neutral'}>{labelize(text(row.requirement, 'importance'))}</Pill>
                    <Pill tone="accent">{labelize(text(row.requirement, 'requirement_type'))}</Pill>
                    <Pill tone={text(row.requirement, 'required_or_preferred') === 'required' ? 'good' : 'neutral'}>{labelize(text(row.requirement, 'required_or_preferred'))}</Pill>
                  </div>
                </div>
                <div className="matrix-cell">
                  <span>Evidence</span>
                  <strong>{row.evidence ? text(row.evidence, 'title', 'Untitled evidence') : 'No proof attached'}</strong>
                  <p>{row.evidence ? text(row.evidence, 'description', 'No description yet.') : text(row.match, 'explanation', 'No match has been written yet.')}</p>
                </div>
                <div className="matrix-cell">
                  <span>Proof strength</span>
                  <Pill tone={matrixTone(row.proofQuality)}>{labelize(row.proofQuality)}</Pill>
                  {text(row.match, 'gap_type') && text(row.match, 'gap_type') !== 'none' ? <small>{labelize(text(row.match, 'gap_type'))}</small> : <small>No explicit gap</small>}
                </div>
                <div className="matrix-cell action-cell">
                  <span>Next action</span>
                  <p>{row.nextAction}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="two-column" id="proof">
          <section className="panel">
            <SectionHeader icon={<ShieldCheck size={18} />} title="Proof ledger" />
            {!evidenceQuery.records.length ? <EmptyState title="Evidence items will appear after profile mining." /> : null}
            <div className="record-stack">
              {sortLatest(evidenceQuery.records).slice(0, 6).map((item) => (
                <article className="record-item" key={rowId(item) || text(item, 'title')}>
                  <div className="record-title">
                    <strong>{text(item, 'title', 'Untitled evidence')}</strong>
                    <Pill tone={statusClass(text(item, 'strength'))}>{labelize(text(item, 'strength'))}</Pill>
                  </div>
                  <p>{text(item, 'description', 'No description yet.')}</p>
                  {text(item, 'weaknesses') ? <small>{text(item, 'weaknesses')}</small> : null}
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <SectionHeader icon={<Lightbulb size={18} />} title="Evidence matches" />
            {!relatedMatches.length ? <EmptyState title="Requirement-to-proof matches will appear here." /> : null}
            <div className="record-stack">
              {relatedMatches.map((match) => (
                <article className="record-item" key={rowId(match) || text(match, 'explanation')}>
                  <div className="record-title">
                    <strong>{labelize(text(match, 'match_strength'))}</strong>
                    <Pill tone={statusClass(text(match, 'proof_quality'))}>{labelize(text(match, 'proof_quality'))}</Pill>
                  </div>
                  <p>{text(match, 'explanation', 'No explanation yet.')}</p>
                </article>
              ))}
            </div>
          </section>
        </section>

        <section className="outputs-grid" id="outputs">
          <section className="panel">
            <SectionHeader icon={<TimerReset size={18} />} title="Gap sprints" />
            {!relatedSprints.length ? <EmptyState title="Gap sprints will appear after strategy analysis." /> : null}
            <div className="record-stack">
              {relatedSprints.map((sprint) => (
                <article className="record-item" key={rowId(sprint) || text(sprint, 'gap_summary')}>
                  <div className="record-title">
                    <strong>{text(sprint, 'gap_summary', 'Gap sprint')}</strong>
                    <Pill tone="warn">{text(sprint, 'estimated_hours') || '-'}h</Pill>
                  </div>
                  <ul>
                    {asList(value(sprint, 'sprint_steps')).slice(0, 5).map((step) => <li key={step}>{step}</li>)}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <SectionHeader icon={<FileText size={18} />} title="Resume deltas" />
            {!relatedDeltas.length ? <EmptyState title="Resume deltas will appear after analysis." /> : null}
            <div className="record-stack">
              {relatedDeltas.map((delta) => (
                <article className="record-item" key={rowId(delta) || text(delta, 'suggested_text')}>
                  <div className="record-title">
                    <strong>{text(delta, 'section', 'Resume section')}</strong>
                    <Pill tone={text(delta, 'truth_status') === 'supported' ? 'good' : 'warn'}>{labelize(text(delta, 'truth_status'))}</Pill>
                  </div>
                  <p>{text(delta, 'suggested_text', 'No suggested text yet.')}</p>
                  {text(delta, 'reason') ? <small>{text(delta, 'reason')}</small> : null}
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <SectionHeader icon={<Mail size={18} />} title="Recruiter messages" />
            {!relatedMessages.length ? <EmptyState title="Message drafts will appear after analysis." /> : null}
            <div className="record-stack">
              {relatedMessages.map((message) => (
                <article className="record-item" key={rowId(message) || text(message, 'message_body')}>
                  <div className="record-title">
                    <strong>{labelize(text(message, 'channel'))}</strong>
                    <Pill tone="accent">{labelize(text(message, 'recipient_type'))}</Pill>
                  </div>
                  <p>{text(message, 'message_body', 'No message yet.')}</p>
                  {text(message, 'proof_hook') ? <small>{text(message, 'proof_hook')}</small> : null}
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <SectionHeader icon={<ClipboardList size={18} />} title="Interview pack" />
            {!relatedInterviews.length ? <EmptyState title="Interview notes will appear after analysis." /> : null}
            <div className="record-stack">
              {relatedInterviews.map((pack) => (
                <article className="record-item" key={rowId(pack) || text(pack, 'defense_notes')}>
                  <div className="record-title">
                    <strong>Defense notes</strong>
                    <Pill tone="good">Prepared</Pill>
                  </div>
                  <p>{text(pack, 'defense_notes', 'No defense notes yet.')}</p>
                  <ul>
                    {asList(value(pack, 'likely_questions')).slice(0, 4).map((question) => <li key={question}>{question}</li>)}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        </section>

        <section className="two-column" id="interview">
          <section className="panel simulator-panel">
            <SectionHeader icon={<MessageSquareText size={18} />} title="Interview defense simulator" />
            {!interviewQuestions.length ? <EmptyState title="Likely questions will appear after an interview pack is generated." /> : null}
            <label>
              Practice question
              <select value={interviewQuestion || interviewQuestions[0] || ''} onChange={(event) => setInterviewQuestion(event.target.value)}>
                {interviewQuestions.map((question) => <option key={question} value={question}>{question}</option>)}
              </select>
            </label>
            <label>
              Your answer
              <textarea value={interviewAnswer} onChange={(event) => setInterviewAnswer(event.target.value)} placeholder="Answer with a concrete project, action, metric, and honest limitation." rows={7} />
            </label>
            <button className="primary-action" type="button" onClick={runInterviewPractice} disabled={!interviewQuestions.length}>
              <PlayCircle size={18} />
              Score answer
            </button>
          </section>

          <section className="panel simulator-result-panel">
            <SectionHeader icon={<ShieldCheck size={18} />} title="Defense score" />
            {interviewResult ? (
              <div className="defense-result">
                <div className="score-orb">
                  <strong>{interviewResult.score}</strong>
                  <span>/100</span>
                </div>
                <div>
                  <h3>{interviewResult.verdict}</h3>
                  <div className="record-stack">
                    {interviewResult.notes.map((note) => <p className="feedback-note" key={note}>{note}</p>)}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState title="Write an answer to see whether it is defensible from your actual proof." />
            )}
          </section>
        </section>

        <section className="two-column" id="outcomes">
          <form className="panel outcome-panel" onSubmit={(event) => void submitOutcome(event)}>
            <SectionHeader icon={<GraduationCap size={18} />} title="Outcome learning" />
            <label>
              Outcome
              <select value={outcomeForm.outcome} onChange={(event) => updateOutcomeField('outcome', event.target.value)}>
                <option value="interview">Interview</option>
                <option value="offer">Offer</option>
                <option value="rejected">Rejected</option>
                <option value="ghosted">Ghosted</option>
                <option value="withdrew">Withdrew</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label>
              Stage reached
              <input value={outcomeForm.stageReached} onChange={(event) => updateOutcomeField('stageReached', event.target.value)} placeholder="Recruiter screen, onsite, final round" />
            </label>
            <label>
              Reason if known
              <textarea value={outcomeForm.reason} onChange={(event) => updateOutcomeField('reason', event.target.value)} placeholder="Paste feedback or your best factual read." rows={4} />
            </label>
            <label>
              Lessons
              <textarea value={outcomeForm.lessons} onChange={(event) => updateOutcomeField('lessons', event.target.value)} placeholder="What should change in future targeting, proof, or interview prep?" rows={4} />
            </label>
            <label>
              Pattern tags
              <input value={outcomeForm.patternTags} onChange={(event) => updateOutcomeField('patternTags', event.target.value)} placeholder="Python gap, referral worked, SQL screen" />
            </label>
            <button className="primary-action" type="submit" disabled={isOutcomeSubmitting || !activeApplicationId}>
              <GraduationCap size={18} />
              {isOutcomeSubmitting ? 'Logging outcome' : 'Log outcome'}
            </button>
          </form>

          <section className="panel">
            <SectionHeader icon={<BarChart3 size={18} />} title="Outcome history" />
            {!relatedOutcomes.length ? <EmptyState title="Logged outcomes for the selected application will appear here." /> : null}
            <div className="record-stack">
              {relatedOutcomes.map((outcome) => (
                <article className="record-item" key={rowId(outcome) || text(outcome, 'outcome_date')}>
                  <div className="record-title">
                    <strong>{labelize(text(outcome, 'outcome'))}</strong>
                    <Pill tone={outcomeTone(text(outcome, 'outcome'))}>{text(outcome, 'outcome_date', 'No date')}</Pill>
                  </div>
                  {text(outcome, 'stage_reached') ? <p>{text(outcome, 'stage_reached')}</p> : null}
                  {text(outcome, 'reason_if_known') ? <small>{text(outcome, 'reason_if_known')}</small> : null}
                  {asList(value(outcome, 'pattern_tags')).length ? (
                    <div className="chip-list compact">
                      {asList(value(outcome, 'pattern_tags')).map((tag) => <span className="mini-chip" key={tag}>{tag}</span>)}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        </section>

        <section className="panel">
          <SectionHeader icon={<ClipboardList size={18} />} title="Tasks" />
          {!relatedTasks.length ? <EmptyState title="Tasks for the selected application will appear here." /> : null}
          <div className="task-list">
            {relatedTasks.map((task) => (
              <div className="task-row" key={rowId(task) || text(task, 'task_title')}>
                <CheckCircle2 size={17} />
                <strong>{text(task, 'task_title', 'Task')}</strong>
                <Pill tone={statusClass(text(task, 'priority'))}>{labelize(text(task, 'priority'))}</Pill>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGuard
        client={lemmaClient}
        loadingFallback={
          <main className="auth-state">
            <section className="panel">Checking CareerProof access.</section>
          </main>
        }
      >
        <App />
      </AuthGuard>
    </QueryClientProvider>
  </React.StrictMode>,
)