# Design system reference

No formal design-system doc existed before this file — this is a snapshot of
the conventions actually in use across the codebase, written so the next
person adding UI has one place to check instead of guessing from whatever
neighboring file they happen to open. It documents **what's really there**,
including the inconsistencies, rather than an aspirational scale nobody
follows. Before adding a new UI pattern, check here and in
`src/components/ui/` first — extend an existing pattern rather than
inventing a new one.

## Colors

Two systems coexist, split cleanly by where they're used — this isn't
accidental drift, it reflects a real split between the authenticated app and
the public marketing surface:

- **shadcn HSL tokens** (`--background`, `--foreground`, `--primary`,
  `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`,
  `--input`, `--ring`, defined in `src/app/globals.css`, wired into
  `tailwind.config.js`'s `theme.extend.colors`). Used almost exclusively
  **inside `src/components/ui/*` primitives** (Button, Card, Dialog, Badge,
  Popover, Tabs, Select) — not directly in `src/app/**` pages.
- **Raw Tailwind palette** (`slate-*`, `gray-*`, `blue-*`, `cyan-*`,
  `emerald-*`, `amber-*`, `rose-*`) — this is what actual app pages use,
  pervasively (hundreds of occurrences across `tenders/page.tsx`,
  `dashboard/page.tsx`, `admin/**`). `slate` and `cyan`/`blue` are the de
  facto primary neutrals and accent.
- **Public/marketing theme** (`--navy`, `--navy-deep`, `--navy-mid`,
  `--steel`, `--steel-light`, `--silver`, `--silver-pale`, also in
  `globals.css`) is scoped to the homepage hero/landing sections and the
  `hero*` Button variants (`src/components/ui/Button.tsx`) — never used in
  the authenticated app.

**How to apply:** if you're building a `src/components/ui/*` primitive, use
the shadcn tokens (`bg-primary`, `text-muted-foreground`, etc.) so it
respects the token set. If you're building a page under `src/app/**`, match
what surrounding pages already do — raw `slate`/`cyan` Tailwind classes, not
tokens. Don't introduce a third color source.

## Typography

No custom font-size scale is defined in `tailwind.config.js` — pages use
Tailwind's default scale directly. Observed convention by role:

| Use | Class |
|---|---|
| Page title (h1) | `text-2xl` / `text-3xl`, often responsive-scaled (`text-xl sm:text-2xl lg:text-3xl`) |
| Section header (h2/h3) | `text-lg` / `text-xl` |
| Body / form / table text | `text-sm` (the de facto default for UI text) |
| Captions, badges, table headers, uppercase labels | `text-xs` |
| Dense micro-text (compact table widgets, badge counts) | Arbitrary `text-[10px]` / `text-[9px]` — a de facto "2xs" that isn't in Tailwind's default scale, used repeatedly enough to be a real (if informal) convention |

`text-base` is rarely used deliberately — mostly appears as an unstyled
fallback. The shadcn `CardTitle` primitive defaults to `text-2xl`
(`src/components/ui/Card.tsx`) but most call sites override it with a
smaller size via `className` — treat that default as a starting point to
override, not a rule to match.

## Spacing

- **Page container**: `px-4 sm:px-6 lg:px-8` with `max-w-7xl` or `max-w-6xl`
  is the dominant pattern (~27 files) but not universal — some admin pages
  use fixed padding instead. Prefer the responsive pattern for new pages.
- **Card/panel padding**: `p-4` or `p-3 sm:p-4` on custom cards; the shadcn
  `CardHeader`/`CardContent` primitives hardcode `p-6`.
- **Table cell padding**: `px-4 py-3` or `px-6 py-4`.
- **Gaps**: `gap-2`/`gap-3` for tight UI rows (button groups, inline
  controls), `gap-4`+ for layout-level spacing between blocks. Often
  responsive (`gap-2 sm:gap-4`).
- **Vertical stacking**: `space-y-4` / `space-y-6` in forms and modals.

## Border radius

- `rounded-lg` is the dominant default — the Button and Card primitives'
  base radius, and most buttons/inputs/panels app-wide.
- `rounded-xl` for slightly more prominent CTAs/panels.
- `rounded-md` on form inputs and small buttons.
- `rounded-full` for avatars, small count/notification circles, and tiny dot
  indicators only.
- `rounded-md` for status/label badges (2026-08-09: standardized away from
  `rounded-full` pills app-wide — the shared `Badge` primitive
  (`src/components/ui/Badge.tsx`) already used `rounded-md`, but most inline
  status badges throughout the app were hand-rolled `<span>`s using
  `rounded-full` instead, built from `src/lib/statusColors.ts`'s returned
  classes. All of those were changed to `rounded-md` to match the shared
  primitive's own convention — colors/backgrounds/borders/text are
  unchanged, only the corner radius).
- The shadcn `borderRadius` token scale (`--radius`, `rounded-lg`/`md`/`sm`
  mapped to it in `tailwind.config.js`) exists, but most components use the
  literal Tailwind class rather than reasoning about the token — this is
  inconsistent but low-stakes, since the literal classes and the token
  scale currently resolve to the same values.

## Shadow / elevation

- `shadow-sm` — static surfaces at rest (cards, panels, buttons). Also the
  Card primitive's default.
- `shadow-lg` — floating/elevated elements: dropdown menus, popovers,
  highlighted feature cards.
- `shadow-md` / `shadow-xl` / `shadow-2xl` — rare, mostly in modals/dialogs.

There's no strict written rule beyond "static = `shadow-sm`, floating =
`shadow-lg`" — that's the pattern to match for anything new.

## Breakpoints

Tailwind's default scale (`sm:640px`, `md:768px`, `lg:1024px`, `xl:1280px`,
`2xl:1536px`) plus one project-specific addition:

- `xs: 400px` — added to `tailwind.config.js` (2026-08-09) after discovering
  `src/app/tenders/page.tsx` used `xs:` responsive classes throughout its
  compact table date-editor (`text-[8px] xs:text-[10px]`, `w-20 xs:w-24`,
  `flex-col xs:flex-row`) with no `xs` breakpoint ever defined — those rules
  were silently dead at every screen width, always falling back to the
  tiniest base classes. If you see `xs:` elsewhere and it doesn't seem to be
  doing anything, this is why — check it's not another instance of the same
  drift.
- `sm:` and `lg:` are the two workhorses in practice (the page-container
  pattern, most responsive text sizing). `md:` is used less often, mostly
  for grid/column-count changes. `xl:`/`2xl:` are rare, used only for a
  handful of max-width/grid tweaks.

AGENTS.md §4 requires working cleanly at 320 / 375 / 768 / 1024 / 1440 /
1920 / 2560 / 3840px — note that's a testing requirement across real device
widths, not a 1:1 mapping to Tailwind's breakpoint names; verify the actual
rendered layout at those widths, don't just reason from which `sm:`/`lg:`
classes are present.

## Icon sizing

- `w-4 h-4` (16px) — the dominant size for inline/button icons app-wide.
  The Button primitive defaults child SVGs to `size-4` automatically
  (`[&_svg:not([class*='size-'])]:size-4` in `src/components/ui/Button.tsx`),
  with `size-3`/`size-3.5` for the `xs`/`sm` Button size variants.
- `w-5 h-5` / `w-6 h-6` — larger emphasis icons (empty states, page headers)
  — noticeably rarer, reserve for genuine visual emphasis rather than
  general use.

## What's still genuinely unformalized

- No documented elevation/z-index scale (dropdowns/modals use ad hoc
  `z-40`/`z-50`/`z-[60]` values chosen per-component, not from a shared
  scale).
- No documented animation/transition duration convention beyond `transition`
  (Tailwind's default 150ms) being the near-universal default.

These aren't broken, just informal — if a pattern here starts causing real
inconsistency (like the color-token split or the `xs:` breakpoint did),
that's a signal to formalize it, not a mandate to do so preemptively.
