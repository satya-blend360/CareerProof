# CareerProof App

CareerProof is a Lemma-hosted React app for turning job descriptions into proof-backed application strategy.

## Local Development

```powershell
npm install
npm run dev
```

The app reads Lemma runtime config from Vite environment variables:

- `VITE_LEMMA_API_URL`
- `VITE_LEMMA_AUTH_URL`
- `VITE_LEMMA_POD_ID`

## Production Build

```powershell
npm run build
```

The production artifact is written to `dist/`.

## Deploy

```powershell
lemma apps deploy careerproof --dist-dir dist --pod CareerProof --yes
```

## Runtime Notes

- Authentication is centralized through `AuthGuard`.
- Table data uses `useLiveRecords`, so records update through Lemma datastore change streams instead of polling.
- Workflow status is visible in the selected strategy panel.
- Terminal workflow failures are surfaced in the UI so operators do not mistake partial data for complete strategy output.
- Job descriptions are capped at the `applications.job_description` schema limit of 20,000 characters.