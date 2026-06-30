# CareerProof Project Explanation

## Project Overview

CareerProof is a Lemma-powered AI career strategy command centre for students and recent graduates.

It takes a job description plus resume/profile context and produces an evidence-backed application strategy. The project is split into two main folders:

- `careerproof-lemma`: the Lemma pod bundle containing tables, agents, and workflow definitions.
- `careerproof-app`: the React/Vite frontend deployed as the Lemma app.

## What It Does

CareerProof answers this question:

Should this student apply to this job now, fix something first, seek a referral first, or skip?

It produces:

- Job requirement breakdown
- Proof-to-requirement matching
- Fit and credibility scores
- `apply`, `fix_first`, `skip`, or `referral_first` decision
- 24-48 hour gap sprint
- Honest resume edits
- Recruiter/referral message
- Interview prep pack
- Follow-up tasks

The core product rule is: no fabricated proof. If a resume claim is unsupported, the system marks it weak or missing and creates a gap sprint instead of pretending it is true.

## Architecture

The project has two layers.

### 1. Lemma Pod Backend

The Lemma pod is the backend. It stores structured data, runs AI agents, and orchestrates the application strategy workflow.

It contains:

- Tables for applications, requirements, proof, matches, sprints, tasks, messages, and outcomes
- AI agents for parsing, strategy, sprint planning, resume edits, recruiter messages, and interview prep
- A workflow that runs those agents in order

### 2. React Frontend

The frontend app lets the user:

- Paste a job description
- Add resume/profile context
- Start the strategy workflow
- View the generated outputs

The app uses:

- React 19
- Vite
- TypeScript
- `lemma-sdk`
- `lemma-sdk/react`
- TanStack React Query
- Lucide icons

## Data Model

The central table is `applications`. Almost every generated output links back to one application through `application_id`.

Important tables:

- `applications`: company, role, status, decision, fit score, credibility score, job description, next action.
- `job_requirements`: parsed job requirements like Python, SQL, deployment, testing.
- `evidence_items`: student proof, such as projects, coursework, portfolio items.
- `skills`: skill ledger with strength and evidence count.
- `evidence_matches`: maps each requirement to proof or a gap.
- `gap_sprints`: short proof-building plans.
- `tasks`: actionable next steps.
- `resume_deltas`: exact resume edits with `supported`, `needs_artifact`, or `do_not_claim`.
- `recruiter_messages`: LinkedIn/email/referral drafts.
- `interview_packs`: questions, stories, weak areas, refresh topics.
- `outcomes`: application result tracking.
- `student_profile`: student background/profile data.

All tables currently have row-level security enabled, so each user sees their own rows.

## Agents

There are eight agents:

- `evidence-miner-agent`: extracts proof from resume/projects/profile.
- `job-parser-agent`: parses job descriptions into application and requirement records.
- `fit-strategy-agent`: compares requirements to evidence and decides strategy.
- `gap-sprint-agent`: creates a 24-48 hour proof-building sprint.
- `resume-delta-agent`: writes honest resume changes.
- `recruiter-message-agent`: drafts outreach grounded in proof.
- `interview-defense-agent`: prepares interview defense packs.
- `career-learning-agent`: analyzes outcomes and recommends longer-term improvements.

The main workflow uses six of them:

- `job-parser-agent`
- `fit-strategy-agent`
- `gap-sprint-agent`
- `resume-delta-agent`
- `recruiter-message-agent`
- `interview-defense-agent`

## Workflow

The main workflow is `new-application-strategy-workflow`.

Flow:

1. `intake`
   Receives application id, company, role title, job URL, job description, and resume context.

2. `parse_job`
   Calls `job-parser-agent`.
   Creates or updates the application and writes `job_requirements`.

3. `fit_strategy`
   Calls `fit-strategy-agent`.
   Updates decision, scores, status, next action, and writes `evidence_matches`.

4. `gap_sprint`
   Calls `gap-sprint-agent`.
   Writes `gap_sprints` and `tasks`.

5. `resume_delta`
   Calls `resume-delta-agent`.
   Writes `resume_deltas`.

6. `message`
   Calls `recruiter-message-agent`.
   Writes `recruiter_messages`.

7. `interview`
   Calls `interview-defense-agent`.
   Writes `interview_packs`.

8. `end`
   Workflow is complete.

## Frontend Flow

The app entry point is `careerproof-app/src/main.tsx`.

What the UI does:

1. Wraps the app in `AuthGuard`, so only authenticated Lemma users can access it.
2. Creates a shared Lemma client from `careerproof-app/src/lemma-client.ts`.
3. Loads records from pod tables using `useRecords`.
4. Shows dashboard metrics:
   - applications
   - fix-first count
   - ready count
   - open tasks
5. Lets the user submit a new job analysis form.
6. On submit:
   - creates an `applications` row
   - starts `new-application-strategy-workflow`
   - clears the form
   - asks the user to refresh after agents finish
7. Displays outputs for the selected application:
   - strategy summary
   - proof ledger
   - evidence matches
   - gap sprints
   - resume deltas
   - recruiter messages
   - interview pack
   - tasks

One important behavior: the UI currently uses manual refresh, not live table subscriptions.

## Deployment

Build and deploy commands:

```powershell
cd ./careerproof-app
npm run build
lemma apps deploy careerproof --dist-dir dist --pod CareerProof --yes
```

The README says the deployed app is:

```text
https://careerproof.apps.lemma.work
```

## Current State

The earlier failed workflow was repaired data-side.

The historical workflow run still says `FAILED`, because failed Lemma runs are not resumable, but the application now has the records the workflow was supposed to create:

- `10` job requirements
- `10` evidence matches
- `1` gap sprint
- `5` tasks
- `3` resume deltas
- `1` recruiter message
- `1` interview pack

## Suggested Improvement

The biggest technical improvement is workflow reliability.

Right now, the workflow depends on agents writing many records directly. A deterministic function for multi-row writes could make parser and strategy steps safer than asking an agent to perform many table writes itself.
