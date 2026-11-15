# Runbook: iOS release (signing, TestFlight, API base)

Task B1-12. Documentation only. Nothing in this file has been run, built or checked by the author. No Mac, Xcode, Apple Developer account or device was available, so every step below is unverified.

Markers used below:

- **OWNER ACTION**: a step that needs the owner's Apple Developer account, a Mac with Xcode, or a physical iPhone or iPad. An agent cannot do these and must not try.
- **NOT VERIFIED**: a statement about Apple or Capacitor behaviour that the plan did not check against a primary source. Confirm it in the current Apple or Capacitor documentation before relying on it.

Sources: docs/adr/0002-delivery-path.md (API base, CORS, Groq key rule), docs/plan/blueprint.txt lines 75-76 (Capacitor row, Apple Developer Program at $99 per year), docs/plan/research/B1-report.md (native checks in the definition of done, "Needs from the user"), docs/plan/plan.json tasks X1-11, X1-12, X1-13, R5-01, R5-03, R5-16, P4-ICS, P4-U1 and P4-GATE, docs/plan/OPEN-DECISIONS.md D13.

## Status and prerequisites

This runbook is for plan phase P4 (the Capacitor iOS and iPadOS shell). At the time of writing the repository has no `ios/` folder and no `capacitor.config.json`. Task X1-11 creates them, and it can only be done on a Mac with Xcode 26 or later. Until X1-11 is merged, steps 5 to 10 cannot be followed.

Open decision D13 (docs/plan/OPEN-DECISIONS.md) is still unanswered: whether the owner has a Mac with Xcode 26 or later, an Apple Developer account, and which devices and iOS versions. Without a Mac, P4 cannot be built.

Needed before starting:

| Need | Source | State |
|---|---|---|
| Apple Developer Program membership ($99 per year per the blueprint) | blueprint.txt line 76 | OWNER ACTION, not done |
| A Mac with Xcode 26 or later | plan.json X1-11, D13 | OWNER ACTION, unknown |
| An iPhone and an iPad for the device checks, with their iOS versions | D13 | OWNER ACTION, unknown |
| The production API domain | ADR-0002 open items | Not decided. This runbook names no domain. |
| The bundle id | this runbook, step 2 | Not decided. This runbook names no value. |
| Merged code: R5-01 (`apiFetch`), R5-03 and R5-04 (CORS), R5-16 (native CSP), X1-11 to X1-13 (shell, adapter, auth mirror) | plan.json | Check the merge state before starting |

## Release steps

Run the numbered steps in order. Steps 1 to 4 are one-off setup. Steps 5 to 10 repeat for each release.

1. **Enrol in the Apple Developer Program. OWNER ACTION.**
   Sign in with the Apple ID that will own the app and enrol in the Apple Developer Program (individual or organisation). Pay the annual fee ($99 per year per the blueprint; confirm the current price and the enrolment checks on Apple's enrolment page). Wait until the membership is active. Record the Team name and the 10-character Team ID shown in the account's Membership details. Enrolment can take time, so do this before anything else. NOT VERIFIED: how long Apple takes to approve an enrolment.

2. **Choose and register the bundle id. OWNER ACTION.**
   Decide the bundle id once. It is a reverse-DNS string, for example `com.<yourname>.forge`, where `<yourname>` is yours. This runbook does not choose it. Once an app is created in App Store Connect with a bundle id, changing it means creating a new app, so decide carefully. Write the chosen value into `capacitor.config.json` as `appId` (task X1-11 creates that file and the owner or a later task sets the value) and use the same value in Xcode. In the Apple Developer portal under Certificates, Identifiers & Profiles, register an explicit App ID with that bundle id. Enable only the capabilities the build needs. Push Notifications is the one the plan may need (X1-11 lists `@capacitor/push-notifications`); enable it only when the push task ships. Keychain access through the secure-storage plugin does not need a portal capability in the plan's notes. NOT VERIFIED: confirm this against the plugin's own documentation.

3. **Create the app record in App Store Connect. OWNER ACTION.**
   In App Store Connect, add a new iOS app. Choose the bundle id from step 2, a display name, a primary language and a SKU of your choosing. A TestFlight upload needs this record to exist. The same record covers iPhone and iPad because the shell is a universal iOS app (task X1-11; NOT VERIFIED until the Xcode project exists).

4. **Set up signing in Xcode. OWNER ACTION.**
   On the Mac, open `ios/App/App.xcworkspace` (created by X1-11; open the workspace, not the project, if Pods are used). Add the Apple ID under Xcode Settings, then Accounts. Select the App target, open Signing & Capabilities, tick Automatically manage signing, choose the Team from step 1, and confirm the Bundle Identifier equals the value from step 2. Automatic signing creates the certificate and provisioning profiles for you. Keep the deployment target at the value task X1-11 set (iOS 15.0 per its acceptance text). Never commit certificates, private keys, `.p12` files, provisioning profiles or App Store Connect API keys. None of those belong in this repository.

5. **Set the API base for the native build, then build the web assets. OWNER ACTION on the Mac (the commands themselves are plain npm).**
   The native app is served from `capacitor://localhost`, so a relative `/api/...` call cannot reach the deployed functions (ADR-0002, Context). The native build must therefore compile in an absolute API origin.
   - Set `VITE_API_BASE` to the absolute origin of the deployed API (an origin only, with no path and no secret) in the env file for the native build mode. The exact env file name and mode name come from tasks R5-01 and R5-16; R5-16 refers to `--mode native`. Check what the merged code expects.
   - Build with the native mode, for example `npm run build -- --mode native` (the form named in R5-16's acceptance text; confirm it against `package.json` once merged).
   - An empty `VITE_API_BASE` in a native build is a defect, because every API call would fail (ADR-0002, section 2). Check before archiving: the built `dist/` output must contain the production API origin and no relative-only fetch to `/api`.
   - Do not set `server.url` in `capacitor.config.json`. The shell ships the bundled app (ADR-0002, section 1; X1-11 notes).
   - Run the bundle secret check from ADR-0002, section 4: search `dist/` for the Groq key value and for `api.groq.com`. Expect no match. Never put a secret under a `VITE_` name.

6. **Update the server allow-list so it matches the API base. OWNER ACTION (Vercel dashboard).**
   ADR-0002 warns that `VITE_API_BASE` and the CORS allow-list drift apart after a domain change, and says this runbook must say so. They must be changed together. The built-in allow-list entries are `capacitor://localhost`, `https://localhost` and `http://localhost:5173`. Add the production web origin to the `ALLOWED_ORIGINS` environment variable (comma-separated, exact match, no wildcards) in the Vercel project, then redeploy. If the production domain changes: change `VITE_API_BASE`, change `ALLOWED_ORIGINS`, rebuild the native app, and ship a new TestFlight build, because the old build points at the old origin. Leave the owner gate in `/api/agent` as it is. CORS is not authentication.

7. **Sync the web build into the iOS project. OWNER ACTION (needs the Mac).**
   Run `npx cap sync ios` after every web build (X1-11 acceptance names `npm run build && npx cap sync ios`). Run `npx cap doctor` and fix any error it reports. Then search the copied web assets under `ios/App/App/public/` (path is the Capacitor default; NOT VERIFIED until the project exists) for the Groq key value and for `api.groq.com`, and expect no match.

8. **Set the version and build number, then archive. OWNER ACTION.**
   In Xcode, on the App target set the Version (the user-visible number) and the Build (an integer that must be higher than any build already uploaded for that version). Choose the run destination Any iOS Device (arm64), not a simulator. Choose Product, then Archive. Wait for the Organizer window to show the archive. A failed archive is almost always a signing or Team mismatch; return to step 4. NOT VERIFIED: menu names in the Xcode 26 release.

9. **Upload the archive to TestFlight. OWNER ACTION.**
   In the Organizer, select the archive, choose Distribute App, then App Store Connect, then Upload, and accept the automatic signing options. When the upload finishes, wait for App Store Connect to finish processing the build; it appears under the app's TestFlight tab when ready. Answer the export-compliance question when asked. The app uses HTTPS only through the system, but the correct answer is the owner's legal declaration, so this runbook does not answer it for you. Add yourself as an internal tester (the account holder and App Store Connect users can be internal testers), then install the build on the iPhone and the iPad from the TestFlight app. NOT VERIFIED: processing time, the tester limits, how long a build stays available, and whether external testers need a beta review. Check Apple's TestFlight documentation.

10. **Run the post-install native checks on a real iPhone and iPad. OWNER ACTION.**
    These are the native items of the definition of done (docs/plan/research/B1-report.md, Native section; P4-U1 and the P4 gate). Record each result as pass or fail in `docs/qa/p4-native-check.md` (the file P4-U1 writes; this runbook does not create it).
    - [ ] The TestFlight build installs and launches on the iPhone and on the iPad.
    - [ ] Sign-in works, and data syncs with the PWA (change something in the PWA, see it in the app, and the reverse).
    - [ ] Force-quit the app twice and reopen it. The session survives the relaunch (task X1-13, auth mirror; its notes require this device test).
    - [ ] API calls succeed from the `capacitor://localhost` origin and reach the production API host. No call goes to a relative `/api` path.
    - [ ] The Groq key is absent from the bundle: the `dist/` and Capacitor web-asset searches from steps 5 and 7 found nothing, and the same search of the unpacked IPA (the Organizer can export a copy, or use a build downloaded from the archive) also finds nothing. NOT VERIFIED: the exact way to unpack the IPA on the Mac.
    - [ ] Airplane mode: the app opens its shell and local data; API-backed features fail gracefully (ADR-0002 Consequences: API features degrade offline).
    - [ ] The iPad layout works in portrait, landscape and in Split View and Slide Over (the layout checks in the same definition of done).
    - [ ] Pencil sketch saves on the iPad (P4 exit criterion).
    - [ ] Add-to-calendar for a reminder works with the network disabled (task P4-ICS).
    - [ ] Only if push and Face ID shipped: push reaches an installed device, the token is in Keychain, and Face ID gates Money (definition of done, Native section).

## Failure notes

| Symptom | Likely cause | What to do |
|---|---|---|
| Every API call fails in the native app, web is fine | `VITE_API_BASE` empty in the native build, or the origin is missing from the allow-list | Steps 5 and 6. The ADR says an empty base in a native build is a defect. |
| API calls fail only on a preflight (the browser console or Safari Web Inspector shows a CORS error) | `Origin` not in the allow-list, or `OPTIONS` not handled for that handler | Step 6; check that the handler uses the shared helper from R5-03 and R5-04. |
| Signing error at archive | Wrong Team, bundle id mismatch with the registered App ID, or no membership | Steps 1, 2 and 4. |
| Build rejected on upload because the number was already used | Build number not higher than a previous upload for this version | Step 8: raise the Build number and archive again. |
| Session lost after force-quit | Auth mirror not restoring | Task X1-13 and its test. Do not replace supabase-js's localStorage adapter (public/dsa/mastery-map.html reads the same session). |
| App loads blank | Web assets not synced, or the CSP meta blocks the API origin | Step 7; check that R5-16's `connect-src` includes the `VITE_API_BASE` origin. |

## Not decided here

- The production domain, and therefore the values of `VITE_API_BASE` and `ALLOWED_ORIGINS` (ADR-0002 open items).
- The bundle id (step 2).
- Whether the iOS scheme stays `capacitor://localhost` (ADR-0002 open items). Re-check against the installed Capacitor version when P4 starts. The allow-list keeps `https://localhost` for that case.
- App Store (public) release. This runbook stops at TestFlight, which is what P4-U1 asks for. Store listing, screenshots, privacy answers and App Review are not covered.
- The answers to open decision D13 (Mac, Xcode version, devices, iOS versions).
