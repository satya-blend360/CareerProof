# CareerProof: AI Career Strategy Command Centre

## Product Thesis

This is not a normal job tracker.

CareerProof is an AI Career Strategy Command Centre that helps students prove they are credible for a role, decide whether to apply, fix gaps before applying, and prepare to defend their profile.

Core pitch:

> Paste any job. The system tells you whether to apply, fix first, skip, or seek referral, then creates the proof plan, resume changes, recruiter message, and interview defense pack.

## V1 Goal

Build a working Lemma-powered CareerProof app where a student can:

1. Add their resume/profile.
2. Paste a job description.
3. Get structured job requirements.
4. See evidence matches against their projects, skills, coursework, internships, and achievements.
5. Receive an Apply / Fix First / Skip / Referral First decision.
6. Get a 24 to 48 hour gap sprint.
7. Get honest resume bullet changes.
8. Get a recruiter/referral message draft.
9. Get interview defense notes.
10. Track application status and outcomes.

## Differentiated Product Angle

Most tools help students apply to more jobs.

This product helps students become more credible for the right jobs.

The winning difference is the proof layer:

- It maps every job requirement to real student evidence.
- It shows where the student has proof, weak proof, or no proof.
- It refuses to fabricate resume claims.
- It creates short improvement sprints when the student is close.
- It turns outcomes into learning patterns over time.

## Lemma Pod

Create a new Lemma pod:

```text
CareerProof
```

Do not use the existing `Meal log from Telegram` pod for this product.

## Core Lemma Tables

### `student_profile`

Stores the student's core career context.

Suggested fields:

- `full_name`
- `email`
- `target_roles`
- `graduation_year`
- `degree`
- `location_preferences`
- `work_authorization`
- `portfolio_url`
- `github_url`
- `linkedin_url`
- `summary`

### `evidence_items`

Stores proof that the student can actually do something.

Examples:

- projects
- internships
- coursework
- hackathons
- certifications
- achievements
- open-source contributions
- portfolio artifacts

Suggested fields:

- `title`
- `type`
- `description`
- `skills_demonstrated`
- `proof_url`
- `file_path`
- `metrics`
- `strength`
- `weaknesses`
- `story_problem`
- `story_action`
- `story_result`

### `skills`

Stores skill-level signal.

Suggested fields:

- `skill_name`
- `category`
- `strength`
- `evidence_count`
- `best_evidence_item`
- `last_used_at`
- `notes`

### `applications`

Stores each job application.

Suggested fields:

- `company`
- `role_title`
- `status`
- `source`
- `job_url`
- `location`
- `deadline`
- `decision`
- `fit_score`
- `credibility_score`
- `next_action`
- `applied_at`
- `outcome`
- `notes`

### `job_requirements`

Stores parsed requirements from a job description.

Suggested fields:

- `application_id`
- `requirement_text`
- `requirement_type`
- `importance`
- `required_or_preferred`
- `skill`
- `seniority_signal`
- `parsed_reason`

### `evidence_matches`

Maps job requirements to student evidence.

Suggested fields:

- `application_id`
- `requirement_id`
- `evidence_item_id`
- `match_strength`
- `proof_quality`
- `gap_type`
- `explanation`

### `gap_sprints`

Stores short plans to create missing proof.

Suggested fields:

- `application_id`
- `gap_summary`
- `estimated_hours`
- `sprint_steps`
- `artifact_to_create`
- `resume_bullet_after_completion`
- `status`

### `resume_deltas`

Stores suggested resume edits, not fake full rewrites.

Suggested fields:

- `application_id`
- `section`
- `original_text`
- `suggested_text`
- `reason`
- `evidence_item_id`
- `truth_status`

### `recruiter_messages`

Stores outreach drafts.

Suggested fields:

- `application_id`
- `recipient_type`
- `channel`
- `subject`
- `message_body`
- `proof_hook`
- `status`

### `interview_packs`

Stores application-specific prep.

Suggested fields:

- `application_id`
- `likely_questions`
- `best_stories`
- `weak_areas`
- `defense_notes`
- `technical_refresh_topics`
- `questions_to_ask_interviewer`

### `tasks`

Stores follow-ups and sprint actions.

Suggested fields:

- `application_id`
- `task_title`
- `task_type`
- `due_at`
- `priority`
- `status`
- `notes`

### `outcomes`

Stores application results and learning signals.

Suggested fields:

- `application_id`
- `outcome`
- `outcome_date`
- `reason_if_known`
- `stage_reached`
- `lessons`
- `pattern_tags`

## Lemma File Structure

Use Lemma files for source material and generated artifacts.

Suggested folders:

```text
/me/resumes/
/me/job-descriptions/
/me/projects/
/me/interview-notes/
/me/proof-pages/
```

Files matter because agents can search and cite real student evidence instead of inventing experience.

## Lemma Agents

### `evidence_miner_agent`

Extracts evidence from resumes, project descriptions, GitHub summaries, coursework, and notes.

Responsibilities:

- find skills
- find projects
- find measurable achievements
- identify weak or unsupported claims
- populate `evidence_items` and `skills`

### `job_parser_agent`

Turns a job description into structured requirements.

Responsibilities:

- extract role title, company, location, deadline, source
- classify requirements as required or preferred
- identify skills, tools, responsibilities, and seniority signals
- populate `applications` and `job_requirements`

### `fit_strategy_agent`

Decides the strategy for a job.

Possible decisions:

- `Apply`
- `Fix First`
- `Skip`
- `Referral First`

Responsibilities:

- compare job requirements to evidence
- calculate fit and credibility scores
- explain the decision
- identify the next best action

### `gap_sprint_agent`

Creates a realistic 24 to 48 hour improvement sprint.

Responsibilities:

- identify the most valuable missing proof
- suggest small artifacts the student can create quickly
- avoid unrealistic or fake improvements
- create tasks in `tasks`
- populate `gap_sprints`

### `resume_delta_agent`

Suggests honest resume edits tied to proof.

Responsibilities:

- improve wording
- move relevant projects higher
- add keywords only when supported by evidence
- refuse unsupported claims
- populate `resume_deltas`

### `recruiter_message_agent`

Drafts messages grounded in proof.

Responsibilities:

- create LinkedIn, email, or referral messages
- include a proof hook
- keep tone natural and concise
- populate `recruiter_messages`

### `interview_defense_agent`

Creates interview prep for a specific application.

Responsibilities:

- likely questions
- best project stories
- weak areas the interviewer may question
- honest defense notes
- technical refresh topics
- questions to ask interviewer
- populate `interview_packs`

### `career_learning_agent`

Studies outcomes over time.

Responsibilities:

- detect rejection patterns
- identify recurring skill gaps
- recommend next portfolio moves
- update long-term strategy notes

## Main Workflow

Create workflow:

```text
new_application_strategy_workflow
```

Flow:

```text
User pastes JD
-> job_parser_agent parses requirements
-> evidence_miner_agent refreshes evidence if needed
-> fit_strategy_agent compares requirements to proof
-> gap_sprint_agent creates improvement plan if needed
-> resume_delta_agent creates honest resume edits
-> recruiter_message_agent drafts outreach
-> interview_defense_agent prepares interview notes
-> tasks are created
-> application dashboard updates
```

## App Screens

The app should feel like an operator dashboard, not a landing page.

### Dashboard

Shows:

- applications by status
- pending tasks
- upcoming deadlines
- weak skill patterns
- top recommended next actions

### New Job Analysis

Main action screen.

Inputs:

- paste job description
- job URL
- optional company/contact notes

Output:

- parsed job
- fit score
- credibility score
- decision
- next action

### Application Detail

Shows everything for one job:

- decision
- fit score
- evidence map
- missing proof
- gap sprint
- resume deltas
- recruiter message
- interview defense pack
- tasks and status

### Proof Ledger

Shows all claims and evidence.

States:

- verified proof
- weak proof
- no proof
- needs artifact

### Gap Sprint

Shows short improvement plans.

Example:

```text
Gap: No cloud deployment proof.

Sprint:
1. Deploy existing project.
2. Add live demo link to README.
3. Add screenshots.
4. Write one honest resume bullet.
5. Prepare one interview story.
```

### Interview Pack

Shows:

- likely questions
- best STAR stories
- weak-area defenses
- technical topics to review
- questions to ask interviewer

### Outcome Learning

Shows:

- rejection patterns
- interview conversion rate
- recurring missing skills
- best next portfolio project

## Demo Flow

The demo should start with the strongest moment.

1. User pastes a backend internship job description.
2. System parses the role.
3. System responds:

```text
Decision: Fix First
Fit: 64%
Reason: strong Python/API proof, weak SQL/cloud deployment proof.
```

4. System shows a 48-hour sprint:

```text
Add PostgreSQL to your existing project.
Deploy the backend.
Update README with endpoint docs and screenshots.
Add one honest resume bullet.
Send recruiter message with project proof.
```

5. System shows:

- resume deltas
- recruiter message
- proof page
- interview defense pack

This proves CareerProof is not just helping the student apply. It is helping the student become more credible.

## Build Phases

### Phase 1: Lemma Foundation

- Create new pod.
- Create tables.
- Create file folders.
- Add grants.
- Add sample student data.
- Add one or two sample job descriptions.

### Phase 2: Intelligence

- Create agents.
- Write strong agent instructions.
- Test each agent independently.
- Verify that agents write structured records.

### Phase 3: Workflow

- Create `new_application_strategy_workflow`.
- Wire agents together.
- Make one job submission produce all outputs.
- Verify tasks, deltas, messages, and interview pack records.

### Phase 4: App UI

- Build dashboard.
- Build new job analysis screen.
- Build application detail screen.
- Build proof ledger.
- Build gap sprint and interview pack views.

### Phase 5: Demo Polish

- Add realistic sample profile.
- Add realistic sample JD.
- Add polished copy.
- Add empty states and loading states.
- Deploy app.
- Test end-to-end flow.

## V1 Scope Boundaries

Do not build these in V1:

- LinkedIn scraping
- auto-apply
- Gmail automation
- calendar automation
- complex multi-user college dashboards
- too many third-party integrations

These can come later. V1 should win because the intelligence and strategy are sharper, not because it connects more APIs.

## Future V2 Ideas

- Gmail integration for recruiter threads.
- Calendar integration for interview reminders.
- LinkedIn/referral relationship tracker.
- College/career-cell dashboard.
- Cohort-level analytics.
- Public proof page sharing.
- Portfolio artifact generator.
- Mock interview voice agent.
- Rejection pattern intelligence across many students.

## Final Positioning

> CareerProof is an AI command centre that turns every job description into an evidence-backed application strategy, showing students what proof they have, what proof is missing, and exactly how to become credible before they apply.


