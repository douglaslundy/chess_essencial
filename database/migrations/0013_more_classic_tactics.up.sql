INSERT INTO exercises (
  id, external_id, title, prompt_md, solution_md, difficulty, category, fen, side_to_move,
  solution_lines, hints, tags, status, position_type, import_metadata
) VALUES
  (
    '13000000-0000-4000-8000-000000000001', 'challenge-promotion-mate-001',
    'Mate de promoção', 'As brancas jogam. Promova o peão dando xeque-mate.',
    '1.c8=Q#', 'intermediate', 'Desafios jogáveis',
    'k7/2P5/1K6/8/8/8/8/8 w - - 0 1', 'white',
    '[ ["c7c8q"] ]'::jsonb,
    '["O rei preto está preso no canto e o seu rei cobre a casa de fuga.", "Promova o peão para dama."]'::jsonb,
    ARRAY['challenge', 'mate_de_promocao', 'mate', 'promocao'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","challenge":true,"ratingBand":"1000-1399"}'::jsonb
  ),
  (
    '13000000-0000-4000-8000-000000000002', 'challenge-diagonal-mate-001',
    'Mate na diagonal longa', 'As brancas jogam. Abra a diagonal para dar xeque-mate de bispo.',
    '1.Bb2#', 'advanced', 'Desafios jogáveis',
    '7k/7p/8/8/8/8/8/2B3RK w - - 0 1', 'white',
    '[ ["c1b2"] ]'::jsonb,
    '["A torre já cobre a coluna g.", "Leve o bispo para a diagonal a1-h8."]'::jsonb,
    ARRAY['challenge', 'mate_diagonal', 'mate', 'bispo_e_torre'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","challenge":true,"ratingBand":"1400-1799"}'::jsonb
  ),
  (
    '13000000-0000-4000-8000-000000000003', 'classic-promotion-mate-001',
    'Mate de promoção (prática)', 'As brancas jogam. Promova o peão dando xeque-mate.',
    '1.c8=Q#', 'intermediate', 'Clássicos',
    'k7/2P5/1K6/8/8/8/8/8 w - - 0 1', 'white',
    '[ ["c7c8q"] ]'::jsonb,
    '["O rei preto está preso no canto e o seu rei cobre a casa de fuga.", "Promova o peão para dama."]'::jsonb,
    ARRAY['classico', 'mate_de_promocao', 'mate', 'promocao'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","ratingBand":"1000-1399"}'::jsonb
  ),
  (
    '13000000-0000-4000-8000-000000000004', 'classic-diagonal-mate-001',
    'Mate na diagonal longa (prática)', 'As brancas jogam. Abra a diagonal para dar xeque-mate de bispo.',
    '1.Bb2#', 'advanced', 'Clássicos',
    '7k/7p/8/8/8/8/8/2B3RK w - - 0 1', 'white',
    '[ ["c1b2"] ]'::jsonb,
    '["A torre já cobre a coluna g.", "Leve o bispo para a diagonal a1-h8."]'::jsonb,
    ARRAY['classico', 'mate_diagonal', 'mate', 'bispo_e_torre'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","ratingBand":"1400-1799"}'::jsonb
  )
ON CONFLICT (external_id) DO NOTHING;
