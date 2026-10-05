UPDATE game_error_signals
SET
  rule_version = 'stockfish_error_signal_v1',
  evidence = evidence - 'detectedTheme'
WHERE rule_version = 'stockfish_error_signal_v2';
