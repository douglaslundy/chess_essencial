INSERT INTO exercises (
  id, external_id, title, prompt_md, solution_md, difficulty, category, fen, side_to_move,
  solution_lines, hints, tags, status, position_type, import_metadata
) VALUES
  (
    '11000000-0000-4000-8000-000000000001', 'challenge-mate-in-one-001',
    'Mate em um: corredor', 'As brancas jogam. Encontre o xeque-mate em um lance.',
    '1.Re8#', 'beginner', 'Desafios jogáveis',
    '6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1', 'white',
    '[ ["e1e8"] ]'::jsonb,
    '["Observe como os próprios peões pretos retiram as casas de fuga.", "A torre pode chegar à oitava fileira."]'::jsonb,
    ARRAY['challenge', 'mate_em_um', 'mate', 'corredor'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","challenge":true,"ratingBand":"0-999"}'::jsonb
  ),
  (
    '11000000-0000-4000-8000-000000000002', 'challenge-mate-in-two-001',
    'Mate em dois: combinação abafada',
    'As brancas jogam. Calcule a sequência forçada até o mate em dois lances das brancas.',
    '1.Qg8+ Rxg8 2.Nf7#', 'advanced', 'Desafios jogáveis',
    '5r1k/6pp/4Q2N/8/8/8/8/K7 w - - 0 1', 'white',
    '[ ["e6g8", "f8g8", "h6f7"] ]'::jsonb,
    '["Comece com um sacrifício de dama que obriga a torre a capturar.", "Depois da captura em g8, procure o salto do cavalo que cobre h8."]'::jsonb,
    ARRAY['challenge', 'mate_em_dois', 'mate', 'sacrificio', 'abafamento'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","challenge":true,"ratingBand":"1400-1799"}'::jsonb
  ),
  (
    '11000000-0000-4000-8000-000000000003', 'challenge-save-king-001',
    'Salvar o rei: interposição',
    'O rei branco está em xeque. Salve-o interpondo o bispo na coluna e.',
    '1.Be2', 'beginner', 'Desafios jogáveis',
    'k3r3/8/8/8/8/8/8/4KB2 w - - 0 1', 'white',
    '[ ["f1e2"] ]'::jsonb,
    '["Em um xeque de linha, você pode mover o rei, capturar o atacante ou bloquear.", "Use o bispo de f1."]'::jsonb,
    ARRAY['challenge', 'salvar_o_rei', 'defesa', 'xeque', 'interposicao'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","challenge":true,"ratingBand":"0-999"}'::jsonb
  ),
  (
    '11000000-0000-4000-8000-000000000004', 'challenge-fork-001',
    'Garfo de cavalo',
    'As brancas jogam. Dê xeque e ataque a torre ao mesmo tempo.',
    '1.Nc7+', 'intermediate', 'Desafios jogáveis',
    'r3k3/7p/8/1N6/8/8/8/6K1 w - - 0 1', 'white',
    '[ ["b5c7"] ]'::jsonb,
    '["Procure uma casa de onde o cavalo ataque e8 e a8.", "O salto parte de b5."]'::jsonb,
    ARRAY['challenge', 'garfo', 'ataque_duplo', 'cavalo'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","challenge":true,"ratingBand":"1000-1399"}'::jsonb
  ),
  (
    '11000000-0000-4000-8000-000000000005', 'challenge-pin-001',
    'Cravada absoluta',
    'As brancas jogam. Crave o cavalo preto ao rei.',
    '1.Bb5', 'intermediate', 'Desafios jogáveis',
    '4k3/3n4/8/8/2B5/8/8/6K1 w - - 0 1', 'white',
    '[ ["c4b5"] ]'::jsonb,
    '["Alinhe bispo, cavalo e rei na mesma diagonal.", "O bispo de c4 deve recuar uma casa."]'::jsonb,
    ARRAY['challenge', 'cravada', 'cravada_absoluta', 'bispo'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","challenge":true,"ratingBand":"1000-1399"}'::jsonb
  ),
  (
    '11000000-0000-4000-8000-000000000006', 'challenge-skewer-001',
    'Espeto de torre',
    'As brancas jogam. Dê xeque de modo que a dama fique exposta atrás do rei.',
    '1.Ra5+', 'advanced', 'Desafios jogáveis',
    '8/8/8/3kq3/8/8/8/R6K w - - 0 1', 'white',
    '[ ["a1a5"] ]'::jsonb,
    '["No espeto, a peça mais valiosa precisa sair primeiro.", "Coloque a torre na quinta fileira."]'::jsonb,
    ARRAY['challenge', 'espeto', 'torre', 'ataque_de_linha'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","challenge":true,"ratingBand":"1400-1799"}'::jsonb
  ),
  (
    '11000000-0000-4000-8000-000000000007', 'challenge-discovered-attack-001',
    'Ataque descoberto com xeque',
    'As brancas jogam. Dê xeque com o bispo e descubra o ataque da torre contra a dama.',
    '1.Bh7+', 'expert', 'Desafios jogáveis',
    '3q2k1/8/8/8/8/3B4/8/3R2K1 w - - 0 1', 'white',
    '[ ["d3h7"] ]'::jsonb,
    '["A peça que sai da coluna deve ganhar tempo com xeque.", "Leve o bispo de d3 até h7."]'::jsonb,
    ARRAY['challenge', 'ataque_descoberto', 'bispo', 'torre'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","challenge":true,"ratingBand":"1800+"}'::jsonb
  ),
  (
    '11000000-0000-4000-8000-000000000008', 'challenge-double-check-001',
    'Xeque duplo',
    'As brancas jogam. Encontre o lance de bispo que produz dois xeques simultâneos.',
    '1.Bb5+', 'expert', 'Desafios jogáveis',
    '4k3/8/8/8/8/3B4/8/4R1K1 w - - 0 1', 'white',
    '[ ["d3b5"] ]'::jsonb,
    '["Ao sair da coluna e, o bispo pode revelar a torre.", "Procure uma diagonal que também alcance e8."]'::jsonb,
    ARRAY['challenge', 'xeque_duplo', 'ataque_descoberto', 'bispo', 'torre'], 'published', 'legal_position',
    '{"answerFormat":"move_sequence","challenge":true,"ratingBand":"1800+"}'::jsonb
  )
ON CONFLICT (external_id) DO NOTHING;
