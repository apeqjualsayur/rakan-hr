# Rakan — UI System

Version: 0.1 · Date: 29 Oct 2026
Source of truth: the three reference screens in `ui-reference/`. Colours were sampled directly from those images.
Companion to `PRD.md`. Every screen in the build must follow this file. When something is not covered here, match the reference screens.

| Reference | Shows |
|---|---|
| `ui-reference/desktop-owner-home.png` | Admin/Owner desktop: top nav, hero, approval list, payroll stepper, side cards |
| `ui-reference/mobile-staff-home.png` | Staff PWA home: shift + clock-in hero, quick actions, alert banner, stat cards |
| `ui-reference/mobile-my-credentials.png` | Staff credentials list (CRD-04): progress ring, filter chips, status rows, FAB |

---

## 1. Design principles

1. **Warm, calm, clinical-trustworthy.** Cream canvas, white cards, one deep green brand colour. No pure white page background, no pure black text.
2. **One rust action per screen.** Rust (`accent`) is reserved for the single most important action on a screen (Clock in, Continue review, Add credential). Everything else uses green or outline buttons.
3. **Every row answers "what do I do now?"** List rows = tag/icon + title + one-line context + one action on the right.
4. **Context lines carry the rule.** Secondary text explains *why* (e.g. "Pays 1 × ORP per Employment Act", "Flagged: bank changes always need HR approval"). Compliance stays visible, not hidden in docs.
5. **Status is always text + colour**, never colour alone (accessibility and colour-blind safety).
6. **Bilingual-ready.** Every layout must survive Bahasa Malaysia strings ~30% longer than English. No fixed-width buttons.

---

## 2. Design tokens

### 2.1 Colour

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#F6F3EA` | Page background (both desktop and mobile), search field fill |
| `surface` | `#FFFFFF` | Cards, nav bar, bottom nav, chips (unselected) |
| `border` | `#E4DFD0` | Card borders, dividers, progress track |
| `track` | `#EFEBDD` | Progress bar / ring background |
| `ink` | `#1E2A24` | Headings, body text, selected filter chip fill |
| `ink-muted` | `#5B6B62` | Secondary text, meta lines |
| `ink-soft` | `#3C4A42` | Nav labels, icons |
| `primary` | `#1E6B52` | Brand green: logo tile, hero card, primary buttons, links, progress fill |
| `primary-strong` | `#14503D` | Outline-button text, pressed state |
| `primary-tint` | `#DDEEE5` | Active nav pill, Leave/Claim tags, Valid chip, date tiles |
| `primary-on-hero` | `#478671` | Pills on the green hero (e.g. "At the centre") |
| `accent` | `#C4461F` | **One per screen** CTA: Clock in, Continue review, Add credential; current step in steppers; notification dot |
| `info-tint` / `info` | `#E1E9FB` / `#2D4F9C` | Credential tag, Pending chip |
| `warning-tint` / `warning` | `#FBEBC5` / `#7A4F00` | Overtime tag, Expiring chip, attention banner |
| `danger-tint` / `danger` | `#FADDD6` / `#A12A17` | Bank change tag, Expired chip, danger outline buttons |
| `neutral-tint` / `neutral` | `#E8E5DA` / `#4B5750` | Missing chip |
| `avatar-amber` | `#F2C879` | Avatar background set (cycle by user id) |
| `avatar-mint` | `#BFE0D0` | |
| `avatar-rose` | `#F4B9A6` | |

Contrast check (WCAG AA): `ink-muted` on `canvas` ≈ 5:1 ✓ · white on `primary` ≈ 6.5:1 ✓ · white on `accent` ≈ 4.6:1 ✓ (keep accent button text ≥ 16 px bold).

### 2.2 Typography

**One clean font for everything: Inter** (variable, weights 400–700), loaded with `next/font/google`, subsets `latin` and `latin-ext`.
Why Inter: designed for screen UI, very legible at small sizes on phones, excellent tabular numbers for payroll figures, full Bahasa Malaysia character support, free and self-hosted by Next.js (no external font requests).
Hierarchy comes from size and weight only. Do not add a second typeface.

| Style | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| `display` | 40/48 desktop · 30/38 mobile | 700 | −0.02em | Hero greeting, page title on mobile ("My Credentials") |
| `h2` | 24/32 | 600 | −0.01em | Card titles ("Needs your attention") |
| `h3` | 17/24 | 600 | 0 | Row titles |
| `body` | 16/24 | 400 | 0 | Body text |
| `meta` | 14/20 | 400 | 0 | Context lines, dates (`ink-muted`) |
| `label` | 14/20 | 600 | 0 | Buttons, tags, chips, nav |
| `stat` | 36/40 | 700 | −0.02em | Big numbers (leave days, payslip net, ring %) |

Numbers use `font-variant-numeric: tabular-nums` (payroll, balances, dates). Use Inter's default glyphs (no stylistic sets) for maximum legibility.
Fallback stack: `Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.

### 2.3 Spacing, radius, elevation

| Token | Value |
|---|---|
| Spacing scale | 4, 8, 12, 16, 20, 24, 32, 40, 48 |
| Card padding | 24 desktop · 20 mobile |
| Page gutter | 64 desktop · 16 mobile |
| Gap between cards | 24 desktop · 12 mobile |
| `radius-card` | 24 (cards); 32 for hero |
| `radius-control` | 14 (buttons, tiles, date tiles) |
| `radius-pill` | 999 (tags, chips, nav pill, FAB, search) |
| Shadow | None on cards (1 px `border` only). FAB only: `0 8px 24px rgba(30,42,36,.18)` |
| Touch target | ≥ 44 × 44 px |

### 2.4 Iconography
Line icons, 1.75 px stroke, rounded caps (Lucide matches). 20 px in buttons/nav, 24 px in quick-action tiles. Credential rows use a shield-check icon in a 48 px rounded tile tinted to the status colour.

---

## 3. Layout shells

### 3.1 Desktop (admin roles: Owner, HR Admin, Payroll Approver, Manager, Auditor)
- **Top nav bar** (white, 1 px bottom border): logo tile + lowercase "rakan" wordmark (the only place the name is lowercase; use "Rakan" in all other copy) · nav items: Home, People, Hiring, Time off, Payroll, Compliance, Reports · search pill ("Search people, forms…") · notification bell (accent dot when unread) · avatar.
- Active nav item = `primary-tint` pill with `primary` text.
- Content max width 1800, two columns on Home: main (≈ 2/3) and side rail (≈ 1/3). Collapse to one column under 1024 px.

### 3.2 Mobile PWA (Staff)
- Canvas background, content in cards, 16 px gutter.
- **Bottom nav** (white, top border, safe-area padding): Home, Time, Credentials, Pay, Me. Active = `primary-tint` pill behind icon + `primary` label.
- Floating action button (rust pill, bottom-right above the nav) only on list screens that have one "add" action.

### 3.3 Role → shell
Managers on mobile get the staff shell plus an "Approvals" entry in Home. Admin screens must still be usable on a tablet (≥ 768 px).

---

## 4. Components

| Component | Spec (from references) | Used in |
|---|---|---|
| **Hero card** | `primary` fill, radius 32, white text. Meta line (date · branch) → `display` greeting → one-line summary ("5 items need you. Payroll pay date is Friday."). Right side: quick-action buttons (white fill, `ink` text, icon left). Mobile variant: today's shift + location pill + full-width accent button. | Owner Home, Staff Home |
| **Card** | `surface`, 1 px `border`, radius 24, title `h2` + optional right link ("All approvals", `primary`). | Everywhere |
| **Action row** | Left: category tag (fixed width ~150 desktop) or status icon tile. Middle: title (`h3`) + meta line. Right: one button. Rows separated by 1 px `border` dividers. | Needs your attention, approval queues |
| **Category tag** | Pill, `label`, tint background + dark text of the same family: Credential = info, Leave/Claim = primary, Overtime = warning, Bank change = danger. | Approval rows, notifications |
| **Status chip** | Pill, `label`: Valid (primary), Pending (info), Expiring soon (warning), Expired (danger), Missing (neutral), Upcoming (info), Rejected (danger). Always shows the word. | Credentials, compliance matrix |
| **Buttons** | Primary: `primary` fill, white text, radius 14, height 48 (desktop) / 52 (mobile). Accent: `accent` fill (one per screen). Outline: white fill, 1.5 px `primary` border + `primary-strong` text. Danger outline: `danger` border + text (for risky reviews like bank change). Text link: `primary`, `label`. | |
| **Quick-action tile** | White, radius 20, 1 px border, icon (24 px, `primary`) over label. 4 across on mobile. | Staff Home |
| **Attention banner** | `warning-tint` fill, radius 20, bold title + meta line + chevron; whole banner tappable. | Staff Home credential alert |
| **Stat card** | Small `meta` label, `stat` number, optional unit in `h3` ("of 8 days"), optional progress bar. | Leave balance, latest payslip |
| **Progress ring** | 8–10 px stroke, `primary` on `track`, `%` centred in `stat`/`h2`. Text block to the right: headline + one explanatory line. | Credential health, My Credentials |
| **Progress bar** | 8 px, radius pill, `primary` on `track`, label left + "5 of 7" right. | Employer setup checklist, leave balance |
| **Status stepper** | Segmented bar, one segment per state: done = `primary`, current = `accent`, upcoming = `border`. Labels under each segment, current label bold. Header row: title left, context right ("Pay date Fri 30 Oct · paying from Maybank ••4821 (default)"). | Payroll run (draft → paid) |
| **Person row** | 48 px avatar (initials, avatar colour set) + name (`h3`) + meta line. | Who's out, people lists |
| **Date tile** | 72 px square, `primary-tint`, radius 14, month (`label`, caps) over day (`h2`). | Coming up / statutory calendar |
| **Filter chips** | Pills; selected = `ink` fill + white text; unselected = white + border. Include counts ("Action needed 2"). | Credentials, lists |
| **Credential row** | Icon tile (status-tinted) · title + meta ("Expired 12 Oct 2026 · mandatory") · chip top-right · action link bottom-right (Renew now = danger, Renew = warning, View = primary, Add = primary). | My Credentials |
| **FAB** | Accent pill, "+" icon + label, bottom-right above bottom nav. | My Credentials |
| **Masked values** | Bank / IC numbers shown as `Maybank ••4821`. | Payroll, profile |

### 4.1 States every component needs
Default, hover (desktop), pressed, focus ring (2 px `primary` offset 2 px), disabled (40% opacity, no hover), loading (skeleton blocks in `track` colour), empty (illustration-free: one line of `ink-muted` + one action), error (inline `danger` text under the field).

---

## 5. Content & copy rules

- Greeting by time of day ("Good morning / afternoon / evening, {first name}"); BM equivalents ("Selamat pagi / tengah hari / petang").
- Summaries count what needs action: "5 items need you." Never "You have notifications."
- Dates: `29 Oct`, `Fri 30 Oct`, `3–4 Nov` (en dash). Money: `RM 3,354.65` (space after RM, 2 decimals). Times: `8:30 am`.
- Meta lines join facts with ` · ` (middle dot).
- Credential copy is action-led: "Renew BLS before your next clinical shift."
- Never show full IC or bank numbers in lists.

---

## 6. Fixes to apply vs the mockups

1. **Payroll stepper wraps "Paid" onto a second line** (6 states, only 5 fit). Use 6 equal segments on one row; on narrow widths, show the current step label only.
2. **Mobile shift time wraps** ("8:30 am – 5:30 / pm"). Keep the time range on one line (`white-space: nowrap`, step down to 28 px on screens < 380 px wide).
3. **Location pill** ("At the centre") must reflect the live geofence result; when outside show `warning` styling with "Outside the centre" and keep Clock in enabled with a reason prompt (PRD ATT-01).
4. **Accent overuse guard:** on Owner Home the "Continue review" button is the single accent; the stepper's current segment uses accent as a status colour, which is fine. Do not add a second accent button to that screen.

---

## 7. Implementation (Next.js + Tailwind)

`tailwind.config.ts` → `theme.extend`:

```ts
colors: {
  canvas: '#F6F3EA', surface: '#FFFFFF', border: '#E4DFD0', track: '#EFEBDD',
  ink: { DEFAULT: '#1E2A24', muted: '#5B6B62', soft: '#3C4A42' },
  primary: { DEFAULT: '#1E6B52', strong: '#14503D', tint: '#DDEEE5', onHero: '#478671' },
  accent: '#C4461F',
  info: { DEFAULT: '#2D4F9C', tint: '#E1E9FB' },
  warning: { DEFAULT: '#7A4F00', tint: '#FBEBC5' },
  danger: { DEFAULT: '#A12A17', tint: '#FADDD6' },
  neutral: { DEFAULT: '#4B5750', tint: '#E8E5DA' },
  avatar: { amber: '#F2C879', mint: '#BFE0D0', rose: '#F4B9A6' },
},
borderRadius: { control: '14px', tile: '20px', card: '24px', hero: '32px' },
fontFamily: {
  sans: ['var(--font-inter)', 'Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
},
```

Component library: shadcn/ui primitives restyled with these tokens; icons from `lucide-react`. Build shared components in `src/components/ui/` named after §4 (`HeroCard`, `ActionRow`, `CategoryTag`, `StatusChip`, `StatusStepper`, `ProgressRing`, `CredentialRow`, `DateTile`, `QuickActionTile`, `AttentionBanner`, `StatCard`, `BottomNav`, `TopNav`, `Fab`).

Status → style mapping lives in one file (`src/lib/status-styles.ts`) so credential, leave, claim and payroll statuses stay consistent.

Dark mode: not in scope for MVP.
