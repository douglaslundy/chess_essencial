UPDATE game_error_signals AS signal
SET
  rule_version = 'stockfish_error_signal_v2',
  evidence = jsonb_strip_nulls(
    signal.evidence
    || jsonb_build_object(
      'detectedTheme',
      CASE
        WHEN analysis.missed_win AND analysis.mate_before > 0
          THEN 'missed_forced_mate'
        ELSE NULL
      END
    )
  )
FROM game_move_analyses AS analysis
WHERE analysis.game_id = signal.game_id
  AND analysis.ply = signal.ply
  AND signal.rule_version = 'stockfish_error_signal_v1';
