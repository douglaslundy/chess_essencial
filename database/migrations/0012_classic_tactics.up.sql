INSERT INTO exercises (
  id, external_id, title, prompt_md, solution_md, difficulty, category, fen, side_to_move,
  solution_lines, hints, tags, status, position_type, import_metadata
) VALUES
  (
    '12000000-0000-4000-8000-000000000001', 'challenge-queen-king-mate-001',
    'Mate de dama apoiada pelo rei', 'As brancas jogam. Dê xeque-mate apoiando a dama com o rei.',
    '1.Qb7#', 'beginner', 'Desafios jogáveis',
    'k7/2K5/8/8/8/8/8/1Q6 w - - 0 1', 'white',
    '[ ["b1b7"] ]'::jsonb,
    '["O rei preto está preso no canto.", "Aproxime a dama de modo que o seu rei a proteja."]'::jsonb,
    ARRAY['challenge', 'mate_de_dama', 'mate', 'rei_e_dama'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","challenge":true,"ratingBand":"0-999"}'::jsonb
  ),
  (
    '12000000-0000-4000-8000-000000000002', 'challenge-ladder-mate-001',
    'Mate em escada (duas torres)', 'As brancas jogam. Dê xeque-mate com a segunda torre.',
    '1.Rb8#', 'beginner', 'Desafios jogáveis',
    '7k/R7/8/8/8/8/8/1R4K1 w - - 0 1', 'white',
    '[ ["b1b8"] ]'::jsonb,
    '["Uma torre já corta a sétima fileira.", "Suba a outra torre até a oitava fileira."]'::jsonb,
    ARRAY['challenge', 'mate_em_escada', 'mate', 'duas_torres'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","challenge":true,"ratingBand":"1000-1399"}'::jsonb
  ),
  (
    '12000000-0000-4000-8000-000000000003', 'challenge-smothered-mate-001',
    'Mate abafado', 'As brancas jogam. Encontre o mate de cavalo com o rei preto abafado pelas próprias peças.',
    '1.Nf7#', 'advanced', 'Desafios jogáveis',
    '6rk/6pp/3N4/8/8/8/8/6K1 w - - 0 1', 'white',
    '[ ["d6f7"] ]'::jsonb,
    '["O rei preto não tem nenhuma casa livre ao redor.", "O cavalo salta de d6 para f7."]'::jsonb,
    ARRAY['challenge', 'mate_abafado', 'mate', 'cavalo'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","challenge":true,"ratingBand":"1400-1799"}'::jsonb
  ),
  (
    '12000000-0000-4000-8000-000000000004', 'challenge-arabian-mate-001',
    'Mate árabe (torre e cavalo)', 'As brancas jogam. Dê xeque-mate com a torre, apoiada pelo cavalo.',
    '1.Rh1#', 'expert', 'Desafios jogáveis',
    '7k/6p1/5N2/8/8/6K1/8/R7 w - - 0 1', 'white',
    '[ ["a1h1"] ]'::jsonb,
    '["O cavalo em f6 cobre duas casas de fuga do rei.", "Leve a torre para a coluna h."]'::jsonb,
    ARRAY['challenge', 'mate_arabe', 'mate', 'torre_e_cavalo'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","challenge":true,"ratingBand":"1800+"}'::jsonb
  ),
  (
    '12000000-0000-4000-8000-000000000005', 'classic-queen-king-mate-001',
    'Mate de dama apoiada pelo rei (prática)', 'As brancas jogam. Dê xeque-mate apoiando a dama com o rei.',
    '1.Qb7#', 'beginner', 'Clássicos',
    'k7/2K5/8/8/8/8/8/1Q6 w - - 0 1', 'white',
    '[ ["b1b7"] ]'::jsonb,
    '["O rei preto está preso no canto.", "Aproxime a dama de modo que o seu rei a proteja."]'::jsonb,
    ARRAY['classico', 'mate_de_dama', 'mate', 'rei_e_dama'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","ratingBand":"0-999"}'::jsonb
  ),
  (
    '12000000-0000-4000-8000-000000000006', 'classic-ladder-mate-001',
    'Mate em escada (prática)', 'As brancas jogam. Dê xeque-mate com a segunda torre.',
    '1.Rb8#', 'beginner', 'Clássicos',
    '7k/R7/8/8/8/8/8/1R4K1 w - - 0 1', 'white',
    '[ ["b1b8"] ]'::jsonb,
    '["Uma torre já corta a sétima fileira.", "Suba a outra torre até a oitava fileira."]'::jsonb,
    ARRAY['classico', 'mate_em_escada', 'mate', 'duas_torres'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","ratingBand":"1000-1399"}'::jsonb
  ),
  (
    '12000000-0000-4000-8000-000000000007', 'classic-smothered-mate-001',
    'Mate abafado (prática)', 'As brancas jogam. Encontre o mate de cavalo com o rei preto abafado pelas próprias peças.',
    '1.Nf7#', 'advanced', 'Clássicos',
    '6rk/6pp/3N4/8/8/8/8/6K1 w - - 0 1', 'white',
    '[ ["d6f7"] ]'::jsonb,
    '["O rei preto não tem nenhuma casa livre ao redor.", "O cavalo salta de d6 para f7."]'::jsonb,
    ARRAY['classico', 'mate_abafado', 'mate', 'cavalo'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","ratingBand":"1400-1799"}'::jsonb
  ),
  (
    '12000000-0000-4000-8000-000000000008', 'classic-arabian-mate-001',
    'Mate árabe (prática)', 'As brancas jogam. Dê xeque-mate com a torre, apoiada pelo cavalo.',
    '1.Rh1#', 'expert', 'Clássicos',
    '7k/6p1/5N2/8/8/6K1/8/R7 w - - 0 1', 'white',
    '[ ["a1h1"] ]'::jsonb,
    '["O cavalo em f6 cobre duas casas de fuga do rei.", "Leve a torre para a coluna h."]'::jsonb,
    ARRAY['classico', 'mate_arabe', 'mate', 'torre_e_cavalo'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","ratingBand":"1800+"}'::jsonb
  ),
  (
    '12000000-0000-4000-8000-000000000009', 'classic-knight-fork-001',
    'Garfo de cavalo (rei e dama)', 'As brancas jogam. Dê um xeque de cavalo que também ataque a dama preta.',
    '1.Nc7+ ganha a dama', 'intermediate', 'Clássicos',
    'q3k3/8/8/1N6/8/8/8/6K1 w - - 0 1', 'white',
    '[ ["b5c7"] ]'::jsonb,
    '["Procure uma casa de onde o cavalo ataque o rei e a dama ao mesmo tempo.", "O salto parte de b5."]'::jsonb,
    ARRAY['classico', 'garfo', 'ataque_duplo', 'cavalo'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","ratingBand":"1000-1399"}'::jsonb
  )
ON CONFLICT (external_id) DO NOTHING;
