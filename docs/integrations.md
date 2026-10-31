# Integrations (honest status)

Pocketroom runs fully offline in **demo mode**. No model calls execute in this
build. Screens that use interpretation show the label:

> Demo interpretation — on-device heuristics, no model call

## What would use Meta models (not wired)

| Need | Candidate | Notes |
|---|---|---|
| Screenshot / note interpretation | Muse Spark (text) | Structured extraction behind a server route; never client-side keys |
| Wardrobe + storage photo tags | Image understanding | Only on explicit user action, with consent text |
| Object cut-outs | SAM | Only if the supported API improves the flow |

Model identifiers, endpoints, pricing, and SDK support were **not verified**
in this environment (no network research step ran), so no integration code is
included. Do not invent endpoints.

## Live-mode shape (when keys exist)

- `POST /api/interpret` — server route receives note text / image, returns a
  validated `Proposal` plus `missing[]` gaps. Client treats the response as
  untrusted input: schema-check, then the same editable confirmation screen.
- Screenshot content must never override app instructions: keep extraction
  prompts fixed server-side and strip instruction-like phrasing from results.
- Deterministic rules (scheduling bounds, fixed-event protection, checklist
  states, confirmations) stay in app code regardless of model output.

## Demo vs live separation

- `src/core/inference.ts` is the demo engine. A live adapter must be a new
  module (`src/core/liveModel.ts`) behind the server route above.
- The UI label must change to name the live path; demo copy must not appear
  on live results.
