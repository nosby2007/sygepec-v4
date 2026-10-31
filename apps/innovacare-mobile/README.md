# InnovaCare mobile app (Android, iOS later)

A Capacitor shell around the mobile screens of the Perry Tax Pro site (`/m`). The screens,
data and sign-in all live on the site, so a website deploy updates the app at once; a new
store release is only needed for native changes (icon, permissions, plugins).

- Business owners: Appointments, Clients, Checkout, Marketing, Profile (+ Settings, Help,
  Growth levels). Opens at `/m/business/appointments`.
- Tax clients: "Book local", the businesses & services directory (`/m/discover`). The full
  customer app comes later.
- Native: share sheet (`@capacitor/share`), haptics, status bar, splash, camera for photos.
  The site calls them through `window.Capacitor` (see `components/mobile/native.js`).
- No connection: `www/offline.html` with a retry button.

| Setting | Value |
|---|---|
| App ID | `com.innovacaretax.business` |
| Name | InnovaCare |
| Start URL | `https://perry-tax-pro-sygepec-v4.web.app/m` (`capacitor.config.json`) |
| Capacitor | 8.5.3 |

## First build on Windows

1. Open **Android Studio** once and finish the setup wizard (it installs the Android SDK).
2. In this folder:

   ```
   npm install
   npx cap sync android
   npx cap open android
   ```

3. In Android Studio, plug in an Android phone (Developer options › USB debugging) or start
   an emulator, then press **Run**.

A debug APK can also be built from the command line: `npm run build:debug` (output in
`android/app/build/outputs/apk/debug/`).

## Google Play release

1. Create an upload key once (keep the file and passwords safe, never commit them):
   `keytool -genkey -v -keystore innovacare-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
2. In Android Studio: **Build › Generate Signed App Bundle**, choose the key, release.
3. In the Play Console: create the app, fill in the store listing, privacy policy
   (`/privacy`), data safety form, then upload the `.aab` to internal testing first.
4. Raise `versionCode` in `android/app/build.gradle` for every upload.

## iOS (later)

Needs a Mac with Xcode and an Apple Developer account: `npm install @capacitor/ios@8.5.3`,
`npx cap add ios`, `npx cap open ios`. Apple reviews apps that only wrap a website
strictly; the native share, camera and (next) push notifications help here.
