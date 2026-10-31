# Phase 14 - Course content and exercise import

## Scope

Phase 14 homologates the ten course modules and imports the canonical 1,298-exercise
collection while preserving source IDs, numbers, module/chapter references, diagrams and
audit history.

The user-provided file under `helper_files/` remains ignored. The deployable canonical
copy lives at
`database/content/Xadrez_Essencial_Exercicios_1_a_1298.json`, so every environment
receives the same content only through the approved GitHub and Git-pull release flow.

## Source inventory

| Check                                             |                                                           Expected | Validated |
| ------------------------------------------------- | -----------------------------------------------------------------: | --------: |
| Normalized SHA-256                                | `0036682cf778eab9a87bb2691cddd942f85b12bd8f5b485c595c9efe74f8b369` |       yes |
| Schema version                                    |                                                              1.0.0 |       yes |
| Modules                                           |                                                                 10 |        10 |
| Chapters                                          |                                                                119 |       119 |
| Diagrams                                          |                                                                300 |       300 |
| Exercises                                         |                                                              1,298 |     1,298 |
| Exercises with diagram references                 |                                                                229 |       229 |
| Missing module/chapter/diagram references         |                                                                  0 |         0 |
| Duplicate module, diagram or exercise IDs/numbers |                                                                  0 |         0 |
| Invalid exercise checksum formats                 |                                                                  0 |         0 |
| Dry-run rejected exercises                        |                                                                  0 |         0 |

Run the reproducible checks with:

```bash
pnpm content:validate
pnpm --filter @xadrez/api db:import-exercises database/content/Xadrez_Essencial_Exercicios_1_a_1298.json --strict --dry-run
```

## Import guarantees

- The database write is one transaction guarded by a PostgreSQL advisory transaction lock.
- Strict mode aborts before persistence when normalization rejects any exercise.
- Exercises are upserted by the unique source number and retain the canonical external ID.
- The ten module titles are synchronized from the canonical source.
- Existing lesson links for the imported set are removed and rebuilt in the same transaction,
  preventing stale links after a changed mapping.
- Every successful execution creates an `exercise_import_runs` audit record.
- A persistence error rolls back the run, module-title updates, exercises and lesson links.

## CI and release gate

PR #13 CI run 29616080467 passed quality, database integration and container validation.
The database-integration job validates the source, imports the real collection into a clean
PostgreSQL database, then runs the importer integration test and the exercise runtime E2E
suite. The importer integration test proves:

1. repeated import keeps one exercise and one current lesson link;
2. each successful run has a separate audit record;
3. changed mappings replace stale lesson links;
4. a conflict in any item rolls back the whole run.

The VPS release script validates content before migrations, uses the pre-existing automatic
database backup, seeds the course, performs a strict import, and only then starts the release
health gates. Code and content reach the VPS only through `main` and
`deploy/auto-deploy.sh`.

## Rollback and reimport

The operational rollback is a full restore of the pre-release database backup created by
`deploy/backup-database.sh`. This is required because an upsert can replace prior exercise
content; deleting the latest import run alone cannot reconstruct the previous row values.

After restore, reimport is performed by deploying an approved commit through the same
Git-pull timer. Direct database edits, SCP and SSH-triggered deploys are not part of the
procedure.

## Deployment evidence

- PR #13 merged at `a3e6ae8`; main CI run `29616343005` passed all three jobs.
- Automatic Git-pull deploy created backup `chess-20260717T220753Z.dump` and finished healthy.
- Database: 1,298 exercises, 1,298 unique source numbers, 1,298 unique external IDs,
  source range 1-1298 and zero rejected records.
- Positions: 229 positioned exercises reference 225 distinct diagrams. The canonical source
  contains and validates all 300 diagrams; 75 are not referenced by an exercise.
- Canonical titles for all ten modules were synchronized.
- API samples: module 1 has 110 exercises; modules 5 and 10 have 132 each.
- Exercise web route returned HTTP 200.
- Isolated rollback drill restored the pre-release backup with zero exercises, then two strict
  imports both produced exactly 1,298 exercises and two audit runs. The temporary database
  was discarded; the active database was not interrupted.

## Lesson source and canonical dataset

> **Removed from deploy (2026-10-31):** the book lesson dataset (`Xadrez_Essencial_Aulas_1_a_119.json`) was deleted from the repository and is no longer imported by `deploy/remote-deploy.sh` or CI. The importer (`db:import-lessons <file>`) remains as a generic tool and now requires an explicit file path. The description below is historical.

The provided `Xadrez_Essencial_Volumes_1_a_10.pdf` has 476 pages and SHA-256
`5c04386a52193fb6f89b969731f307ac30c3ef08dd7ea9ebfec7a400e4c9662b`. Text extraction
and volume boundaries were verified for all ten volumes. The deployable lesson dataset lives
at `database/content/Xadrez_Essencial_Aulas_1_a_119.json` and contains:

- 119 lessons matching the 119 canonical chapters;
- 714 lesson steps, each lesson containing six steps;
- real printed source pages scoped by source volume;
- 1,282 selected exercise links, respecting the maximum of 12 per lesson;
- eight board interactions whose FEN and expected UCI move pass the chess rules engine.

Run the combined gate with `pnpm content:validate`. The lesson importer dry-run is:

```bash
pnpm --filter @xadrez/api db:import-lessons database/content/Xadrez_Essencial_Aulas_1_a_119.json --strict --dry-run
```

Migration `0009_lesson_content_import` records import runs and attributes automated lesson
versions to the import run instead of a human editor. The importer is transactional,
idempotent, archives non-canonical lessons without deleting them and can publish only the
canonical set of ten modules and 119 lessons. The release sequence imports exercises first,
then imports lessons, rebuilds the explicit 2-12 exercise links and publishes atomically.

## Acceptance completed

Phase 14 passed every gate. PR #14 and main CI applied migration 0009, imported the full dataset twice, proved idempotency, restored the database backup and rolled the latest migration back and forward. The automatic Git-pull release created backup chess-20260718T030556Z.dump, published 119 lessons and 1,282 links, and passed API, worker, web, course and load health checks. Production reports 10 modules, 119 published lessons, 714 steps and one successful published lesson import run. Phase 15 is unblocked.
