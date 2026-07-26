UPDATE exercises
   SET tags = array_remove(tags, 'challenge')
 WHERE 'lichess' = ANY(tags);
