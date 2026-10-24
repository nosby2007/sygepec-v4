# Phase 3: public Business booking, services, team and availability

## What changed

- **Business profile and public link.** Owners edit their public page under
  *Public page* (`/portal/business/profile`): name, unique link
  (`/business/{slug}`), description, contact details, logo and cover image,
  time zone, opening hours with breaks, closed dates, and booking rules
  (notice, window, cancellation cut-off, reschedule limit, buffer, capacity).
  Nothing is public until the status is *Published*, and online booking has
  its own switch. Links are claimed atomically (`bizSlugs/{slug}`), so two
  businesses can never share one; renaming frees the old link.
- **Services.** Services now have a description, a photo, and *public* and
  *active* switches, and can be edited. Only public, active services appear on
  the business page.
- **Team calendars.** *Team* (`/portal/business/team`) holds bookable people,
  each with optional own hours and a list of services they do. Each person has
  their own calendar. Without a team, a business uses N parallel seats.
- **Public pages.** `/business/{slug}` shows the profile, services, team,
  contact details and hours, with SEO metadata, a canonical URL and
  `LocalBusiness` structured data built only from what the owner entered.
  `/business/{slug}/book` lets a visitor pick a service, a person (or anyone
  available) and an open time.
- **Guest bookings.** No account is needed. The guest gets a private link
  (`/business/{slug}/booking/{token}`, never indexed) to check, reschedule or
  cancel within the business's rules. Nothing is emailed yet, and the page
  says so.
- **Owner bookings.** *Bookings* (`/portal/business/bookings`) shows a
  day/week/month calendar in the business's time zone and a queue of requests
  to confirm. The owner can confirm, complete, mark a no-show, cancel, move a
  booking (any free time, even off-hours), and add bookings for walk-ins or
  phone calls. The old unchecked schedule form in *Services & Billing* now
  points here; earlier appointments stay visible read-only.

## How it stays safe

- **No privileged server access.** The Cloud Run identity has no Firestore
  role. Public pages read only what the rules make public, unauthenticated.
  A guest booking is written with a throwaway **anonymous Firebase identity**,
  and the rules check every field: the business is published and accepts
  bookings, the service is public and its name, price and length match, the
  person is active, bookable and correctly named, the time respects notice and
  window, and the status matches the business's auto-confirm setting.
- **The guest's link** carries that identity's refresh token, encrypted with
  `SESSION_SECRET` and bound to its purpose; a session cookie cannot be
  replayed as a booking link and vice versa.
- **No double booking.** Each booking writes one lock per 15/30/60-minute cell
  and person (`bizSlots/{businessId}_{cell}_{resource}`) in the same commit,
  with "must not exist" preconditions. The rules require the first and last
  lock to be written with the booking, check every lock's ID matches its fields
  and booking, and only let a guest release locks their own booking dropped.
  Tax appointments got the same "locks in the same commit" check.
- **Isolation.** A business can only read its own bookings, staff (beyond the
  public fields) and draft profile. Tested directly against the rules.
- **Abuse limits.** A honeypot field, a minimum time on the form, a per-IP and
  per-email throttle on the server, and Firebase's own limits on anonymous
  sign-ups per IP.
- **Images** are stored under `biz/{businessId}/public/` (images only, 2 MB,
  owner-only upload) and served from our own domain through
  `/api/public/media/…`, so the page CSP stays `img-src 'self'`.

## Required setting before public booking works

Firebase Authentication must allow **Anonymous** sign-in (Firebase console >
Authentication > Sign-in method > Anonymous > Enable). Until then, the booking
page answers "Online booking isn't switched on yet. Please call the business."
Everything else in this phase works without it. Email sign-up is already open
on the project, so anonymous sign-in gives no access an email account doesn't.
Turning on automatic clean-up of anonymous accounts is recommended.

## Tests

- `npm test`: booking engine (staff hours, resources, DST), Zoom client.
- `npm run test:rules`: 26 rules tests (tax side, including the new lock check).
- `npm run test:integration`: 17 tests that run the real server code against
  the Firestore, Auth and Storage emulators. They cover profile and link
  uniqueness, public visibility, staff hours, guest booking and its link,
  6 simultaneous guests (exactly one wins), "anyone available" filling each
  person once, guest cancel and reschedule limits, bots, forged links,
  cross-business isolation, and a guest writing directly to Firestore with a
  changed price, person, status or service.

## Running it locally

The app honours the emulator variables outside production builds, so it can be
clicked through with test accounts:

```bash
node firebase/test/build-rules.mjs
firebase emulators:start --config firebase/test/firebase.json --project demo-perry-tax --only firestore,auth,storage
# in another terminal, with the same variables for both commands:
#   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9098
#   FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9195 NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-perry-tax
#   NEXT_PUBLIC_FIREBASE_API_KEY=fake-api-key NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-perry-tax.appspot.com
#   SESSION_SECRET=<any 32+ characters>
node --import ./test/node-hooks.mjs test/seed-emulators.mjs
npx next dev -p 3100
```

`test/seed-emulators.mjs` creates a business owner, a tax client and a preparer
(emulator-only test accounts) and the demo business
`/business/maple-street-studio`.

## Known limits

- Team members are calendars, not logins. Inviting staff with their own
  accounts and roles needs a membership model and is not built yet.
- The guest link is long (about 700 characters) because it carries the sealed
  credential.
- The throttle is per server instance; Firebase's anonymous sign-up limits and
  the rules are the hard limits.
- A guest bypassing the app could still hold fewer lock cells than their
  booking covers (the rules check both ends of the list, not every cell).
- A business directory (`/business/directory`) is planned for Phase 4.
