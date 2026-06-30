# CareerProof

CareerProof is a Lemma-powered AI career strategy command centre for students and recent graduates.

It turns a pasted job description into an evidence-backed strategy:

- Apply, Fix First, Skip, or Referral First decision
- proof ledger and evidence matching
- 24 to 48 hour gap sprint
- honest resume deltas
- recruiter message with proof hook
- interview defense pack
- outcome learning loop

## Bundle Layout

- `tables/`: RLS-protected user tables for applications, evidence, requirements, matches, sprints, tasks, messages, packs, skills, outcomes, and profile data.
- `agents/`: Lemma POD-toolset agents that write the strategy outputs. Production guardrails in the instructions require idempotency and post-write verification.
- `workflows/new-application-strategy-workflow/`: the manual intake workflow that runs parser, strategy, sprint, resume, message, and interview agents in order.
- `payloads/`: repeatable test payloads for smoke testing.

## Import Or Update The Pod

Run a dry run first:

```powershell
lemma pods import ./careerproof-lemma --pod CareerProof --dry-run
```

If the plan is clean, import the bundle:

```powershell
lemma pods import ./careerproof-lemma --pod CareerProof
```

## Frontend App

The frontend app source lives separately in `careerproof-app`.

```powershell
cd ./careerproof-app
npm run build
lemma apps deploy careerproof --dist-dir dist --pod CareerProof --yes
```

The deployed app is available at:

```text
https://careerproof.apps.lemma.work
```

## Production Smoke Test

Use the bundled smoke payload before considering the pod production-ready. The app creates the application row before starting the workflow, so the CLI smoke test should do the same:

```powershell
$app = lemma records create applications --pod CareerProof --data '{"company":"Codex Smoke Test Co","role_title":"Backend Intern Smoke Test","status":"analyzing","source":"manual smoke test","job_url":"https://example.com/backend-intern-smoke-test","job_description":"Backend internship working with Python APIs, PostgreSQL, REST endpoints, Git, debugging, and cloud deployment. Candidates should have built at least one API project, used SQL, written tests, and documented their work.","notes":"Production smoke test."}' --output json | ConvertFrom-Json
$payload = Get-Content ./careerproof-lemma/payloads/smoke-new-application.json | ConvertFrom-Json
$payload.application_id = $app.id
$payload | ConvertTo-Json -Depth 10 | Set-Content ./careerproof-lemma/payloads/.smoke-run.json
lemma workflows run new-application-strategy-workflow --pod CareerProof --file ./careerproof-lemma/payloads/.smoke-run.json
```

Then verify the generated records for the returned application id:

```powershell
lemma records list applications --pod CareerProof --limit 5
lemma records list job_requirements --pod CareerProof --limit 20
lemma records list evidence_matches --pod CareerProof --limit 20
lemma records list gap_sprints --pod CareerProof --limit 5
lemma records list tasks --pod CareerProof --limit 10
lemma records list resume_deltas --pod CareerProof --limit 10
lemma records list recruiter_messages --pod CareerProof --limit 5
lemma records list interview_packs --pod CareerProof --limit 5
```

Expected minimum output for one completed strategy run:

- one application with `decision`, `fit_score`, `credibility_score`, `status`, and `next_action`
- multiple `job_requirements` rows for the application
- evidence matches that cover important requirements as either proof or explicit gaps
- at least one `gap_sprints` row for `fix_first` decisions
- actionable task rows
- resume deltas with `truth_status`
- one recruiter message draft
- one interview pack

## Failure Handling

If a workflow run fails:

1. Inspect the run:

```powershell
lemma workflows runs get <run-id> --pod CareerProof --full
```

2. Check the failed node and partial records.
3. Do not trust the application as complete unless all expected output tables have rows for that `application_id`.
4. If the failure happened in `parse_job`, verify `job_requirements` first; downstream agents depend on those rows.
5. Repair or rerun only after confirming duplicate records will not be created.

## Current Demo State

The current demo pod includes one repaired fix-first application, a student profile, evidence items, evidence matches, a gap sprint, resume deltas, a recruiter message, an interview pack, and open tasks.

The previous failed workflow run remains historically failed, but its application was repaired data-side with complete output rows.