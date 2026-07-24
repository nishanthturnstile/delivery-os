# Delivery OS Design System

**Status:** Normative frontend specification
**Parents:** [Product Plan](product-plan.md), [Architecture & Contracts](architecture-contracts.md)
**Related:** [Development Guidelines](development-guidelines.md)

## 1. Decision

Delivery OS uses:

- Current stable Tailwind CSS v4.
- Current stable shadcn CLI/components as a source-code accelerator.
- Base UI as the only headless primitive library.
- A source-owned Delivery OS component library in `packages/ui`.

Radix UI is prohibited internally. Application code must not import Base UI directly; it consumes Delivery OS wrappers and patterns. Exact package versions are locked and upgraded through reviewed changes.

This matches current shadcn guidance: as of July 2026, [Base UI is the default and recommended base for new shadcn projects](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default). Tailwind v4 uses CSS-first configuration, semantic CSS variables, `@theme inline`, OKLCH colors, and `data-slot` styling as described in the [shadcn Tailwind v4 guide](https://ui.shadcn.com/docs/tailwind-v4).

## 2. Design Principles

1. **Intent is visible.** Status, approval, provenance, risk, audience, and next action must be understandable without opening a detail panel.
2. **Dense, not cramped.** Delivery work contains substantial evidence; use progressive disclosure and consistent information hierarchy rather than oversized cards.
3. **Trust before decoration.** Source citations, AI-proposal state, human decisions, and immutable baselines have distinct visual treatment.
4. **Calm operational color.** Color communicates state and risk, never acts as the only signal, and does not turn the interface into a rainbow of badges.
5. **Keyboard-complete workflows.** Drag-and-drop is optional enhancement; every action has a focusable, named alternative.
6. **Client clarity.** Client-visible surfaces remove internal jargon and never expose hidden fields through layout, loading, or error behavior.
7. **Responsive by priority.** Small screens preserve decisions and next actions before secondary metadata.
8. **Motion explains change.** Motion is brief, interruptible, respects reduced-motion preferences, and never hides state.

## 3. Architecture

```text
packages/ui/
  src/
    styles/          Tailwind entry, semantic tokens, themes
    primitives/      Reviewed shadcn/Base UI source
    components/      Delivery OS system components
    patterns/        Domain compositions
    icons/           Approved icon wrappers
    testing/         Stories, fixtures, accessibility helpers
  components.json    shadcn CLI configuration
  registry.json      Optional internal Delivery OS registry
```

### 3.1 Ownership layers

| Layer | Examples | Import rule |
|---|---|---|
| Tokens | color, type, spacing, radius, elevation, motion, charts | Used through semantic utilities/variables |
| Primitives | Button, Dialog, Menu, Tabs, Field, Tooltip | Only `packages/ui` may import Base UI |
| Components | StatusBadge, RiskIndicator, EmptyState, EvidenceList | Apps import public `@delivery-os/ui` exports |
| Patterns | ApprovalPanel, TraceabilityTable, WorkCard, GapReview | Domain-aware composition; no data fetching |
| Screens | routes/layouts/forms | Live in `apps/web`; use patterns/components |

## 4. shadcn and Tailwind Configuration

- Initialize explicitly with Base UI: `pnpm dlx shadcn@latest init --base base`.
- In the monorepo, run add/update commands against `packages/ui` with the CLI working-directory option.
- Keep `components.json`; use CSS variables, TypeScript, RSC support, a blank Tailwind config path, and workspace package exports.
- Use Tailwind v4 CSS imports: `tailwindcss`, `tw-animate-css`, and the reviewed shadcn Tailwind utilities.
- Define semantic tokens in CSS and expose them with `@theme inline`; do not scatter raw palette utilities through domain screens.
- Use OKLCH for theme colors and separate semantic intent from palette (`--color-danger`, not `--color-red-500` in component contracts).
- Use Base UI state data attributes and shadcn `data-slot` selectors. Never rely on undocumented DOM position selectors.
- Generated shadcn code is reviewed like handwritten code. The CLI may not overwrite customized components without a clean diff and visual/accessibility verification.
- Third-party registries are untrusted source input. Pin the item, inspect its code/license/dependencies, and adapt it into Delivery OS ownership.

## 5. Token Contract

Required semantic groups:

- **Surfaces:** canvas, panel, raised, overlay, inset.
- **Content:** primary, secondary, muted, inverse, link.
- **Actions:** primary, secondary, quiet, destructive.
- **States:** neutral, info, success, warning, danger, blocked, review, approved.
- **Audience/provenance:** team-only, client-visible, AI-proposed, human-authored, source-cited.
- **Focus:** ring color, width, offset, high-contrast fallback.
- **Typography:** display, heading, body, label, code, numeric/tabular.
- **Spacing/density:** compact board/table, standard form, comfortable reading.
- **Shape/elevation:** radius and shadow levels with dark-mode equivalents.
- **Motion:** duration/easing for enter, exit, reorder, progress, and attention.
- **Charts:** ordered categorical and quantitative tokens with non-color labels/patterns.

Workspace primary color may influence branded accents, but it cannot replace system status colors or reduce contrast. Client-provided colors are validated and mapped to safe derived tokens.

## 6. Component Contract

Every public component must:

- Forward appropriate native props and refs where the underlying API supports them.
- Expose stable variants rather than accepting arbitrary visual booleans.
- Define accessible name/description behavior.
- Support focus-visible, disabled, loading, empty, error, and read-only states where applicable.
- Preserve form association and error relationships.
- Avoid hidden side effects, data fetching, authorization decisions, and domain mutation.
- Be usable in light/dark and high-contrast/forced-color environments.
- Include `data-slot` for stable local styling and testing where shadcn conventions apply.

Domain patterns must display audience, provenance, or lifecycle state whenever omitting it could cause a wrong decision.

## 7. Accessibility Standard

Base UI provides many ARIA, keyboard, pointer, and focus behaviors, but the application remains responsible for labels, focus visibility, contrast, content order, announcements, and testing. Follow the [Base UI accessibility guidance](https://base-ui.com/react/overview/accessibility) and WCAG 2.2 AA.

Required checks:

- Full keyboard operation and logical focus order.
- Visible focus that is not obscured.
- Dialog/menu/popover focus entry, containment where appropriate, and restoration.
- Accessible names, descriptions, errors, and live announcements.
- 200% zoom and 320 CSS-pixel reflow for critical flows.
- Contrast and non-color state cues.
- Reduced motion and no motion-dependent meaning.
- Pointer target size and a non-drag alternative.
- Screen-reader verification for approval, work transition, upload/OCR progress, and client decision flows.

## 8. Testing and Release

- Unit tests cover variants, event contracts, and form/a11y relationships.
- Automated accessibility tests run on component stories and critical pages.
- Visual regression covers tokens, modes, density, and responsive states.
- Playwright covers keyboard workflows and focus restoration for critical patterns.
- A component change includes migration notes when props, DOM contract, or tokens change.
- Design-system releases are workspace package versions; apps consume a single compatible version.
- CI fails on Radix dependencies, direct Base UI imports outside `packages/ui`, raw restricted color use, or missing public export tests.

## 9. Initial Visual Baseline — “Trace & Flow”

The initial Delivery OS identity is precise, calm, and evidence-oriented:

- **Typography:** self-hosted Manrope variable for interface/content and IBM Plex Mono for IDs, hashes, code, estimates, and tabular operational values.
- **Palette:** cool graphite/ink neutral surfaces, a clear ultraviolet-cobalt primary action, and a restrained cyan-teal trace accent. Success, warning, danger, approval, audience, and AI-proposal colors remain separate semantic systems.
- **Shape:** 6 px controls and 10 px panels; pills are reserved for compact statuses/tags, not general buttons or cards.
- **Density:** 40 px standard controls and a deliberate compact mode for boards/tables; critical touch actions retain WCAG-compliant target spacing.
- **Elevation:** borders and tonal surface changes carry most hierarchy; shadows are limited to overlays and genuinely raised interaction.
- **Icons:** Lucide behind Delivery OS wrappers at a consistent optical size/stroke. Lifecycle, traceability, audience, and provenance icons receive product-specific wrappers and labels.
- **Motion:** 120 ms micro-feedback and 180 ms enter/exit defaults, with reduced-motion replacements. Progress changes emphasize causality rather than decoration.
- **Data visualization:** status colors are never reused as arbitrary series colors; charts include labels, patterns/markers where needed, and tabular alternatives.

The implementation must encode this baseline through semantic tokens and validate contrast in both modes. Workspace branding may replace a safe accent token after contrast derivation, but cannot alter status, risk, provenance, focus, or audience semantics. Visual refinements change tokens/components centrally and require design-system regression evidence; screens must not invent local themes.
