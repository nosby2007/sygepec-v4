# InnovaCare client app (Android, iOS later)

The app for clients: explore and book local businesses, follow "My bookings" and your
tax return. A Capacitor shell around the `/m/client` screens of the Perry Tax Pro site, so a
website deploy updates the app at once; a new store release is only needed for native
changes (icon, permissions, plugins).

Business owners use the separate **InnovaCare Business** app (`../innovacare-mobile`).

- Explore: published businesses with search, ratings, work photos and services. Open
  without an account.
- Book: service, team member, day and time. Signed-in bookings are saved under Bookings
  (a private `clientBookings` row per booking); guests can still book on the web page.
- Bookings: upcoming and past, with reschedule and cancel within each business's rules.
- Taxes: return status, next step and links to the secure portal (documents, messages,
  appointments, signing, payment).
- Profile: account, security, help and sign-out.

| Setting | Value |
|---|---|
| App ID | `com.innovacaretax.client` |
| Name | InnovaCare |
| Start URL | `https://perry-tax-pro-sygepec-v4.web.app/m/client` (`capacitor.config.json`) |
| Capacitor | 8.5.3 |

## Build on Windows

Same as the business app (see `../innovacare-mobile/README.md`):

```
npm install
npx cap sync android
npx cap open android
```

`android/local.properties` (untracked) points at the SDK, and Java needs
`JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Temp\jtmp` on this PC. A debug APK:
`npm run build:debug` (output in `android/app/build/outputs/apk/debug/`).

## Google Play

A second listing next to InnovaCare Business, with its own upload key. Raise
`versionCode` in `android/app/build.gradle` for every upload.
