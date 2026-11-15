# Domain

How this repo's domain knowledge is laid out, for skills that read it (`/domain-modeling`, `/to-spec`, `/grill-with-docs`).

- **Layout:** single context. The glossary and the rules of the domain live in `CONTEXT.md` at the repo root; create it when the first term needs pinning down.
- **Decisions:** one file per decision under `docs/adr/`, numbered, the filename stating the decision. ADRs load only when a link is followed; do not summarise them elsewhere.
- **The app:** the Expo app lives at `{{APP_DIR}}`, with its routes under `{{ROUTES_DIR}}`.

If the repo grows more than one bounded context, list each here with its own `CONTEXT.md`.
