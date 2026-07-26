-- Move every Lichess-imported tactic into the "Desafios" challenge pool
-- (tagged 'challenge') so they stop appearing in the general Exercícios
-- browser (which already excludes 'challenge'-tagged rows by default) and
-- become selectable there by their existing catalogued theme tags.
UPDATE exercises
   SET tags = array_append(tags, 'challenge')
 WHERE 'lichess' = ANY(tags)
   AND NOT ('challenge' = ANY(tags));
