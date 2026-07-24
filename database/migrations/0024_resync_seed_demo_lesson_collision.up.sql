-- seed.ts used to hardcode a placeholder "primeiro movimento do peão" lesson
-- at (module 1, position 1) with id 00000000-0000-4000-8000-000000000901 —
-- the exact same slot the real book chapter 1 lesson ("Como aprender xadrez
-- de forma deliberada") occupies. Because deploy runs db:seed before
-- db:import-lessons on every deploy, and seed.ts reset lesson_steps
-- unconditionally while db:import-lessons only replaces lesson_steps when its
-- content-diff cache (lesson_versions) shows a change, the title/pages kept
-- getting corrected back to the real chapter 1 content every deploy but the
-- steps stayed the placeholder pawn-move text. seed.ts no longer creates this
-- lesson; deleting the stale version snapshot here forces the very next
-- db:import-lessons run (which happens later in this same deploy) to detect
-- a content change and restore the real chapter 1 steps.
DELETE FROM lesson_versions
WHERE lesson_id = '00000000-0000-4000-8000-000000000901';
