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

## Evidence still required before phase approval

- Pull-request CI: quality, database-integration and container-validation.
- Automatic deploy marker and backup path for the approved `main` commit.
- VPS counts: 10 modules, 1,298 exercises, 300 referenced diagrams represented in metadata,
  unique source IDs/numbers, zero rejected records.
- API/UI samples from the first, middle and last modules.
- Second import with stable exercise and lesson-link counts.
- Restore/reimport drill and final health/load gates.
