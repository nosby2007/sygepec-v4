# InnovaCare Software home and the InnovaTax subdomain

One app and one Firebase Hosting site serve both addresses:

| Address | Shows |
| --- | --- |
| `https://<domain>/` | InnovaCare Software home: product cards |
| `https://<domain>/ehr` | InnovaSoftware Clinic and CameroHealth |
| `https://<domain>/find` | Find your service: search of published InnovaCare Business providers |
| `https://tax.<domain>/` | InnovaTax home (the same page as `/tax`) |

`proxy.js` sends `/` on any host starting with `tax.` to the tax home. Every other tax page
(`/services`, `/login`, `/portal`, `/admin`...) works on both addresses. The tax site's top bar
links back to the main domain.

## Connecting the domain

In Firebase Hosting, site `perry-tax-pro-sygepec-v4`, add both `<domain>` and `tax.<domain>`
as custom domains and create the DNS records Firebase gives you. Then set `TAX_SITE_URL`.

## Links (Cloud Run environment variables, no rebuild needed)

| Variable | Card | Without it |
| --- | --- | --- |
| `TAX_SITE_URL` | InnovaTax, e.g. `https://tax.<domain>` | `/tax` |
| `TRAINING_URL` | InnovaCare Training | Coming soon, contact form |
| `COMPLIANCE_URL` | Compliance | Coming soon, contact form |
| `CLINIC_URL` | InnovaSoftware Clinic | Coming soon, contact form |
| `CAMEROHEALTH_URL` | CameroHealth | Coming soon, contact form |

```bash
gcloud run services update perry-tax-pro --region us-central1 --project sygepec-v4 --update-env-vars TRAINING_URL=https://...
```

Service shortcuts on `/find` are in `SERVICE_CATEGORIES` in `lib/platform.js`. A search
matches words in a provider's name, tagline and town.
