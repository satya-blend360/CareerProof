# CareerProof

CareerProof is a Lemma-powered AI career strategy command centre for students and recent graduates. It turns a pasted job description into an evidence-backed application strategy with proof matching, gap sprints, honest resume deltas, recruiter messaging, interview defense, and outcome learning.

## Project Layout

- `careerproof-app/` - React/Vite Lemma app.
- `careerproof-lemma/` - Lemma pod bundle with tables, agents, functions, workflows, and smoke payloads.

## Local App

```powershell
cd careerproof-app
npm install
npm run dev
```

## Build

```powershell
cd careerproof-app
npm run build
```

## Live App

https://careerproof.apps.lemma.work

## Auto Deploy From GitHub

Pushes to `main` run the GitHub Actions workflow at `.github/workflows/deploy-lemma.yml`. The workflow installs dependencies, builds `careerproof-app`, installs the Lemma CLI, and runs:

```bash
lemma apps deploy careerproof --dist-dir dist --pod CareerProof --yes
```

Configure these repository secrets in GitHub before relying on auto deploy:

- `LEMMA_TOKEN` - Lemma access token for an account that can deploy the app.
- `LEMMA_CLI_INSTALL_COMMAND` - the official Lemma CLI install command for Linux GitHub Actions runners.

You can also trigger the workflow manually from the GitHub Actions tab.
