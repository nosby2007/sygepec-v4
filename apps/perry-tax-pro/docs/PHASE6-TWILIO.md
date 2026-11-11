# Phase 6: Twilio video calls and text messages

## What it does

- **Video calls in the app.** Confirmed virtual tax appointments get a "Join video call"
  button in the client portal and a "Start video call" button for staff. The call runs on
  Twilio Video inside our own pages (`/portal/appointments/<id>/call`,
  `/admin/appointments/<id>/call`).
  - One private room per appointment, at most 4 people, never recorded.
  - The server checks who is asking before it hands out a token. The token is valid for
    that one room only and expires when the call window closes.
  - Clients can join from 15 minutes before the start, staff from an hour before. The
    room closes an hour after the scheduled end.
  - Zoom links still work and become optional.
- **Texts and emails to tax clients.** On a confirmed appointment, staff can send the
  client a message from the app with "Text the client" or "Email the client". The message
  gives the time and points to the portal; it never contains a meeting link. Each send is
  recorded in the appointment history (staff only).
- **Business reminders by text.** In the Business workspace, "Reminders for tomorrow"
  gets a "Text it" button.
- Every text ends with "Reply STOP to opt out". Twilio handles STOP and HELP itself.

Each feature stays off until its credentials are set. Video needs the first three
values below; texting also needs a sender.

## Credentials (Secret Manager, project `sygepec-v4`)

| Secret | Value |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Account SID, `AC…` (Twilio Console home page) |
| `TWILIO_API_KEY_SID` | SID of a **Standard** API key, `SK…` (Console → Account → API keys) |
| `TWILIO_API_KEY_SECRET` | That key's secret, shown once when the key is created |
| `TWILIO_MESSAGING_SERVICE_SID` | `MG…`, recommended for texting; or instead set `TWILIO_FROM_NUMBER` (`+1…`) |

We use an API key instead of the account Auth Token. You can revoke the key on its own
without changing the account password or token.

```bash
printf '%s' 'ACxxxxxxxx' | gcloud secrets create TWILIO_ACCOUNT_SID --data-file=- --project sygepec-v4
printf '%s' 'SKxxxxxxxx' | gcloud secrets create TWILIO_API_KEY_SID --data-file=- --project sygepec-v4
printf '%s' 'the-secret' | gcloud secrets create TWILIO_API_KEY_SECRET --data-file=- --project sygepec-v4
printf '%s' 'MGxxxxxxxx' | gcloud secrets create TWILIO_MESSAGING_SERVICE_SID --data-file=- --project sygepec-v4

for s in TWILIO_ACCOUNT_SID TWILIO_API_KEY_SID TWILIO_API_KEY_SECRET TWILIO_MESSAGING_SERVICE_SID; do
  gcloud secrets add-iam-policy-binding $s --project sygepec-v4 \
    --member serviceAccount:perry-tax-pro-runtime@sygepec-v4.iam.gserviceaccount.com \
    --role roles/secretmanager.secretAccessor
done
```

Then attach them to the service:

```bash
gcloud run services update perry-tax-pro --region us-central1 --project sygepec-v4 \
  --update-secrets TWILIO_ACCOUNT_SID=TWILIO_ACCOUNT_SID:latest,TWILIO_API_KEY_SID=TWILIO_API_KEY_SID:latest,TWILIO_API_KEY_SECRET=TWILIO_API_KEY_SECRET:latest,TWILIO_MESSAGING_SERVICE_SID=TWILIO_MESSAGING_SERVICE_SID:latest
```

## Before texting US numbers

US carriers block texts from numbers that are not registered for **A2P 10DLC**. To
register, go to Twilio Console → Messaging → Regulatory compliance, register the brand,
then register a campaign (use case: "Account notifications" or "Customer care").
Approval usually takes a few days. A toll-free number needs toll-free verification
instead.

## Security notes

- Camera and microphone are allowed only on the two call pages, and only those pages
  may connect to `*.twilio.com`. The same rules are set in `next.config.mjs` and in
  `firebase.json`. Every other page keeps `camera=()` and `microphone=()`.
- Links into and out of a call are full page loads. That way the browser applies the
  call page's own security headers.
- The Firestore rules did not change. Messages the app sends are recorded as
  `MEETING_SHARED` events with the channel `SMS_TWILIO` or `EMAIL_APP`.

## Not built yet

- Two-way texting: an inbox for client replies. It needs an inbound webhook, checked with
  the Twilio signature.
- Click-to-call.
- Automatic reminders on a schedule.
