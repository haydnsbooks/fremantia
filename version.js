// ============================================================================
// APP VERSION — bump this string every time you push an update to GitHub.
// Any format works as long as it changes (date + counter is simple: e.g.
// "2026-09-18.1", then "2026-09-18.2" for a same-day fix, "2026-09-19.1"
// the next day). This is the ONLY thing you need to edit to ship a version
// bump — app.js reads this value at load time, and separately re-fetches
// this exact file (bypassing cache) every few minutes to see whether a
// newer version has been deployed while a tab was left open. See the
// "VERSION CHECK" section in app.js for how the comparison works.
// ============================================================================
const APP_VERSION = "2026-09-17.1";
