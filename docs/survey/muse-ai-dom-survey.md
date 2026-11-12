# muse.ai DOM survey (real page)

Live survey against https://muse.ai, per `docs/muse-code-calibration-brief.md`
Phase 1. Structure and UI vocabulary only — never message content,
credentials, or session material.

Status: NOT STARTED — waiting on browser access + owner sign-in.

## 1. Shell & identity

| Key | Tag | Role | Name/label | Stable attrs | Structural path | Matches | Survives reload / new chat / switch |
|---|---|---|---|---|---|---|---|
| `appRoot` | | | | | | | |
| `signedInMarker` | | | | | | | |
| `agentName` | | | | | | | |
| `signInUi` | | | | | (SKIP if checking requires signing out) | | |

## 2. Composer mechanics

- Element kind (textarea vs contenteditable):
- Send control + how it enables:
- Enter sends?
- Native-setter + input-events path registers with framework?
- Test prompt (new empty chat only):

| Key | Selector match | Notes |
|---|---|---|
| `composer` | | |
| `sendButton` | | |

## 3. Message model

- User vs agent distinction:
- Stable message id? (else position + role + text synthesis)
- Streaming mutation pattern:
- Working indicator lifecycle (`workingIndicator`):

| Key | Selector match | Notes |
|---|---|---|
| `messageList` | | |
| `messageItem` | | |
| `workingIndicator` | | |

## 4. Approvals — UNVERIFIED until a genuine request is observed

- Render form (inline card / modal / other):
- Exact control labels (once / always-allow / deny):
- Post-click DOM outcome signal (`approvalOutcome`):

| Key | Selector match | Notes |
|---|---|---|
| `approvalCard` | | |
| `approvalAllowOnce` | | |
| `approvalAllowPlain` | | |
| `approvalAlways` | | |
| `approvalDeny` | | |
| `approvalOutcome` | | |

## 5. Activity

- How the Activity view opens (`activityButton`):
- Panel structure (`activityPanel`):
- Entry anatomy (`activityEntry`): id, title, state:
- Detail expansion (`activityDetail`):
- Finished-with-outcome marker (`activityOutcome`):
- Active vs Past separation:
