UPDATE exercises
SET tags = array_replace(tags, 'mate_fileira_final', 'mate_corredor')
WHERE 'mate_fileira_final' = ANY(tags);
