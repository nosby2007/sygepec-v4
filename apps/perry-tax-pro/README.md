# Perry Tax Pro

Perry Tax Pro is the standalone InnovaCare tax preparation portal deployed in
the Firebase project `sygepec-v4`. It provides client registration, guided tax
intake, secure document exchange, messaging, appointment requests, return
tracking, and a preparer dashboard.

Production: <https://perry-tax-pro-sygepec-v4.web.app>

## Architecture

- Next.js 16 application with server-rendered routes
- Firebase Authentication for email/password accounts
- Firestore collections isolated under the `perry-tax-pro` tenant
- Firebase Storage objects isolated under `tax/perry-tax-pro/`
- Cloud Run service `perry-tax-pro` in `us-central1`
- Dedicated Firebase Hosting site `perry-tax-pro-sygepec-v4`

The application lives separately from the Angular SYGEPEC application even
though both use the same Firebase project.

## Local development

Copy `.env.example` to `.env.local`, provide a random `SESSION_SECRET` of at
least 32 characters, and then run:

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>.

## Validation

```bash
npm run lint
npm run build
npm audit --omit=dev
```

## Preparer accounts

Public registration always creates a `CLIENT`. A preparer must first exist in
Firebase Authentication and have a matching `taxUsers/{uid}` document with:

```json
{
  "uid": "firebase-auth-uid",
  "name": "Preparer name",
  "email": "preparer@example.com",
  "phone": null,
  "role": "PREPARER",
  "tenantId": "perry-tax-pro",
  "createdAt": "ISO-8601 timestamp",
  "updatedAt": "ISO-8601 timestamp"
}
```

Preparers use the normal `/login` page and are redirected to `/admin`.

## Deployment

The Dockerfile builds the standalone Next.js server. Cloud Run receives the
Firebase public configuration as environment variables and `SESSION_SECRET`
from Secret Manager. After deploying a new Cloud Run revision, redeploy the
dedicated Hosting target so its pinned rewrite points to the new revision:

```bash
gcloud run deploy perry-tax-pro --source . --region us-central1 --project sygepec-v4
npx firebase deploy --only hosting:perry-tax-pro-sygepec-v4 --project sygepec-v4
```

Do not deploy the default `sygepec-v4` Hosting site from this directory.
