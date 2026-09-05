# Orbit Desktop phase-two QA inventory

This inventory maps the user-visible claims covered by the automated suite. The
Electron test always uses an isolated temporary user-data directory and never
invokes `launchApp`, so it cannot start or terminate a real user application.

| Claim or control | Functional check | Visible state / evidence |
| --- | --- | --- |
| Production starts without demo applications | Fresh library is empty; production entry files contain no demo-data import | Launcher shows an empty application count and no demo-only source is returned |
| Scan is review-first | Click **Scan local apps** and wait for the candidate dialog | Candidate drawer is visible before any library mutation |
| Scan results are real and deduplicated | Inspect the platform scan payload; reject demo kinds/sources/IDs and duplicate IDs/names | Drawer contains the same real candidate names |
| Scan failures are not reported as an empty computer | Parse success, empty, malformed, missing and timed-out scanner outcomes separately | UI shows a localized scan error and does not open a stale candidate drawer |
| Only launchable candidates can be selected | Inspect every candidate checkbox/status pair | Invalid/unverified/already-added rows are disabled |
| Removed UWP applications become unavailable | Revalidate stored AUMIDs against the current Start Apps registration set | Missing entries become invalid; a failed registration check becomes unverified |
| Confirmed app is added | Clear the default selection, select one verified candidate, confirm | Selected application appears in the library/manager |
| Search automatically focuses a match | Add two applications and type the first name without pressing Enter | Focused application changes while the query remains available for refinement |
| Remove is Orbit-only | Confirm removal in the manager and re-read Orbit's library | Library becomes empty; no OS uninstall/delete operation is called |
| Language switches immediately and persists | Change General > Language between zh-CN and en-US | Drawer/navigation labels update without a restart; persistence is covered by unit tests |
| Escape safely hides the launcher | Press Escape with no drawer open and inspect BrowserWindow visibility | Window becomes hidden while Electron remains alive |
| Settings reject malformed persisted data | Sanitize out-of-range/enumeration/shortcut values | Safe defaults or clamped values are returned |
| Settings survive storage round-trip | Save and reload through a Storage-like object | Versioned payload restores every supported field |
| Library cap and duplicate policy | Feed duplicate IDs/names and more than 32 candidates | Result has unique IDs/names and at most 32 entries |
| Translation catalogs stay complete | Compare en-US and zh-CN key sets | No missing, extra, or blank translations |

Exploratory/off-happy-path checks included in the suite:

- malformed and future-version settings payloads are sanitized instead of trusted;
- invalid or already-added scan candidates cannot be selected;
- a fresh isolated profile cannot inherit the developer's existing Orbit library.

## Manual release checks

Run these on a disposable Orbit profile before publishing a Windows build. Do not
automate launching arbitrary applications in CI.

1. Start `release/win-unpacked/Orbit Desktop.exe` with a fresh user-data directory.
2. Scan and confirm that no candidate has a `demo-` ID or `developer-demo` kind/source,
   and that duplicate normalized names/IDs are absent.
3. Add one harmless verified application (for example Windows Calculator), click its
   3D node, confirm that it starts, and confirm that Orbit hides only after success.
4. Drag the sphere, release it, and observe continued decaying rotation; zoom both
   directions with the wheel and verify near/far node scale and opacity.
5. Hide Orbit, press the configured global shortcut from another application, and
   confirm Orbit appears. Press Escape and confirm it hides without closing Explorer.
6. Compare Electron process CPU/GPU activity while visible and after the hidden state
   has stabilized. Hidden renderer activity should be materially lower.
7. Remove the test entry in Orbit and verify the real application and shortcut still
   exist. Close any application opened for the check.
