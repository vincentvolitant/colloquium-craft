

# Implementation Plan: Admin UX + Data Editing Improvements

This is a substantial set of changes. Following the requested priority order, here is the plan broken into phases.

---

## Phase 1: Remove "Master" from Kompetenzfeld dropdowns

**What changes:**
- In `ScheduleFilters.tsx` (line 99): Remove the hardcoded `KOMPETENZFELD_MASTER_LABEL` SelectItem from the Kompetenzfeld dropdown. Instead, when "MA" is selected as degree filter, MA exams are already filtered. The "Master" option stays only as a display/grouping label in `ExamCard` and `ExamDetailDialog`, not as a selectable filter value.
- In `ScheduleConfigPanel.tsx`: Verify "Master" is not offered as a selectable Kompetenzfeld in room mapping or data entry contexts.
- Keep `KOMPETENZFELD_MASTER_LABEL` constant for display purposes only (cards, detail dialogs).

**Files:** `src/components/schedule/ScheduleFilters.tsx`, potentially `src/components/admin/ScheduleConfigPanel.tsx`

---

## Phase 2: Fix "Termin verschieben" — all valid options accessible

**Current problem:** `MoveEventDialog.tsx` line 286 slices to 15 slots per day (`daySlots.slice(0, 15)`) and shows "+X weitere..." but those extra slots are unreachable.

**Fix:**
- Replace the hard `slice(0, 15)` with an expandable "Show all" button per day group.
- Add state `expandedDays: Set<string>` — when collapsed show first 15, when expanded show all.
- Add a room filter dropdown within the slots tab so users can narrow results.
- Each slot button already shows time + room; no additional info needed.

**Files:** `src/components/admin/MoveEventDialog.tsx`

---

## Phase 3: Direct editing of topic + public/not-public in admin event view

**What changes:**
- Add two new dropdown menu items in `AdminScheduleManager.tsx`: "Thema bearbeiten" and "Öffentlichkeit ändern".
- Add an inline edit dialog for topic (textarea) that updates the underlying `exam` record via store.
- Add a toggle/switch for `isPublic` that updates the exam record.
- Add `updateExam` action to `scheduleStore.ts` that calls a new `upsertExam` function in `supabaseSync.ts`.

**New store action:**
```typescript
updateExam: (exam: Exam) => void;
```

**Files:** `src/components/admin/AdminScheduleManager.tsx`, `src/store/scheduleStore.ts`, `src/lib/supabaseSync.ts`

---

## Phase 4: Spreadsheet-like table editor in Admin area

This is the largest feature. A new tab "Tabelle" in the Admin page.

**Architecture:**
- New component `src/components/admin/AdminTableEditor.tsx`
- New tab in `src/pages/Admin.tsx` between "Termine" and "Export"
- Uses HTML table with inline editing (no new library — use existing shadcn Table components)
- Features:
  - Sticky header row
  - All columns: Status, Degree, Kompetenzfeld, Student, Topic, P1, P2, P3, P4, Protokollant, Date, Start, End, Room, Public, Cancel reason
  - Click-to-edit cells (text inputs, selects, switches)
  - Filter bar (reuse pattern from `ScheduleFilters`)
  - Sort by clicking column headers
  - Unsaved changes tracking with "Save" button that creates a new version
  - Inline validation warnings (e.g. double-booking)
- Staff dropdowns use search/filter for quick selection
- Undo/redo via a simple edit history stack (last 20 edits)

**Files:** New `src/components/admin/AdminTableEditor.tsx`, modified `src/pages/Admin.tsx`

---

## Phase 5: Multi-select for Prüfer / Protokoll

**What changes:**
- Create a reusable `StaffMultiSelect` component using `cmdk` (already installed) for searchable multi-select with chips.
- Integrate into the table editor for examiner columns and into `ChangeProtocolistDialog`.
- For examiners: allow 2-4 selections.
- For protocolist: single select but using the same searchable component.

**Files:** New `src/components/admin/StaffMultiSelect.tsx`, modified `AdminTableEditor.tsx`

---

## Phase 6: Optimization for external staff compactness

**What changes in `src/lib/scheduler.ts`:**
- In the day-sorting logic (around line 741), add a penalty/bonus for external examiners:
  - If an examiner has `employmentType === 'external'`, strongly prefer days where they already have assignments.
  - Add a secondary sort: penalize spreading external examiners across new days.
- After scheduling, add a warning in conflict reports if an external examiner is spread across multiple days.
- Add gap minimization: when placing exams for external examiners on the same day, prefer time slots adjacent to their existing assignments.

**Files:** `src/lib/scheduler.ts`

---

## Phase 7: Harden XLS import/export identity handling

**What changes:**
- In `exportScheduleToXLSX` (`excelParser.ts`): Add an "ID" column containing the event/exam internal UUID.
- In `parseScheduleXLSX`: If an "ID" column exists, use it for matching on re-import.
- Fallback matching: match by student name + degree + topic combination.
- Never silently duplicate — show warnings for unmatched rows.
- Add conflict detection for ID mismatches.

**Files:** `src/lib/excelParser.ts`, `src/components/admin/ScheduleImportWizard.tsx`

---

## Summary of file changes

| Priority | Feature | Files |
|----------|---------|-------|
| 1 | Remove "Master" from dropdowns | `ScheduleFilters.tsx` |
| 2 | Fix move dialog pagination | `MoveEventDialog.tsx` |
| 3 | Direct topic + public editing | `AdminScheduleManager.tsx`, `scheduleStore.ts`, `supabaseSync.ts` |
| 4 | Table editor | New `AdminTableEditor.tsx`, `Admin.tsx` |
| 5 | Multi-select staff | New `StaffMultiSelect.tsx`, `AdminTableEditor.tsx` |
| 6 | External optimization | `scheduler.ts` |
| 7 | XLS identity handling | `excelParser.ts`, `ScheduleImportWizard.tsx` |

No database schema changes are needed — all existing tables support these features.

Due to the size, I recommend implementing phases 1-3 first, then 4-5 together, then 6-7. Shall I proceed with all 7 phases, or start with phases 1-3?

