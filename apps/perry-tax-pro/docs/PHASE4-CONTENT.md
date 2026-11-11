# Phase 4: public pages, CMS, blog and updates

## Public pages

| Address | Content |
|---|---|
| `/services`, `/services/{slug}` | Services from the CMS: description, benefits, how it works, questions (with FAQ structured data), call to action |
| `/team` | Team members; credentials appear only when a preparer confirmed they are verified |
| `/about`, `/privacy`, `/terms` | CMS pages (404 until published) |
| `/blog`, `/blog/{slug}` | Articles with `BlogPosting` structured data and a "not tax advice" note |
| `/updates` | Dated office news and deadlines |
| `/contact` | Contact details from site settings, optional CMS text, and a form that goes to a staff inbox |
| `/business/directory` | Published InnovaCare Business profiles, with search |
| `/sitemap.xml`, `/robots.txt` | Public pages only; admin, portal, API and private booking links are excluded |

Every page sets a canonical URL. The header now links Services and Blog; the
footer links the new pages and shows contact details from *Website > Contact
details* (it keeps the previous text until those are saved).

Nothing is invented. Pages without published content show an honest empty
state or a 404. The starter drafts reuse the service descriptions already on
the home page, and everything else in them is an `[Edit…]` placeholder that
blocks publishing.

## CMS (Website in the preparer workspace)

- **Types:** pages, services, blog posts, updates, team members.
- **States:** Draft, Scheduled, Published, Archived. Restore turns an
  archived item back into a draft.
- **Scheduling with no background job.** A single item is readable once its
  `visibleFrom` time has passed (checked by the rules on every read).
  Firestore cannot prove a time comparison for list queries, so lists show
  Published items, and a public schedule index (`cmsSettings/schedule`, IDs and
  times only) points the site at due scheduled items, which are then read one
  by one under the same rule.
- **History.** Every save writes an append-only revision in the same commit.
  The editor lists revisions and can load any of them back for re-saving.
- **Preview.** `/admin/content/{id}/preview` renders the saved version with the
  same components as the public site.
- **Safety checks on publish:** `[Edit…]` placeholders, unverified team
  credentials, services without a description.
- **Concurrent edits:** if two people save the same version, the second is told
  to reload rather than silently overwriting.
- **Images:** JPG, PNG or WebP up to 2 MB, stored under `cms/public/` and served
  through `/api/public/media/…` (CSP stays `img-src 'self'`).
- **Contact inbox:** `/admin/content/messages`, mark handled or reopen. The app
  does not send replies or notifications.
- **Editing rights:** preparers. Finer roles (editor vs preparer) are planned
  with the central admin work (Phase 7).

## Tests

`npm run test:integration` now also runs `test/cms.integration.test.mjs`
(10 tests, real server code on the emulators): draft privacy and revisions,
publish/archive/restore, scheduled items staying unreadable until due and
appearing with no job, unique links, the concurrent-save conflict, placeholder
and credential checks, page links, clients unable to write or read drafts,
anonymous listing refused, the contact form and its inbox, site settings.

Clicked through locally on the emulators: starter drafts, publishing refused
with placeholders, editing and publishing a service, the public service page
with FAQ data, the contact form reaching the inbox, directory, sitemap,
robots, and phone width on the new pages.

## Known limits

- The CMS body uses a small Markdown subset (headings, lists, bold, italic,
  links); no tables or embedded media beyond the cover image.
- Search engines see scheduled items only after they are due, and only on the
  next crawl of `/sitemap.xml`.
- The footer still shows the badges "IRS e-file provider" and "4.9 client
  rating", and the home page keeps its figures and testimonials, pending the
  owner's confirmation (see `docs/AUDIT-PHASE1.md`).
