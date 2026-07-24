-- 0022_lichess_tactics tagged backRankMate puzzles 'mate_corredor', which
-- collides (as a substring) with the standalone 'corredor' tag already used
-- by migration 0011's curated back-rank-mate challenge. Renaming in-place via
-- UPDATE instead of editing 0022 directly, since 0022 was already applied in
-- production before this was caught.
UPDATE exercises
SET tags = array_replace(tags, 'mate_corredor', 'mate_fileira_final')
WHERE 'mate_corredor' = ANY(tags);
