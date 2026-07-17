# Design system — identidade Xadrez Essencial

## Cores

```css
:root {
  --bg: #08080A;
  --bg-elevated: #101014;
  --surface: #141419;
  --surface-2: #19191F;
  --border: rgba(255,255,255,.10);
  --text: #F4F1EB;
  --muted: #B8B4AD;
  --red: #D10E17;
  --red-bright: #FF2A2F;
  --red-dark: #75060B;
  --gold: #D8B66C;
  --success: #16A34A;
  --warning: #F59E0B;
  --danger: #DC2626;
}
```

## Tipografia

- Interface: Inter/Geist Sans.
- Títulos editoriais: Georgia ou serif premium licenciada.
- Notação e FEN: Geist Mono.

## Dimensões

- max content: 1440–1500 px;
- sidebar desktop: 272 px;
- topbar: 72 px;
- card radius: 18 px;
- board max desktop: 720 px;
- board mobile: largura disponível com mínimo 320 px;
- spacing base: 4 px.

## Componentes

- AppShell, Sidebar, Topbar;
- ChessBoard, ChessClock, MoveList, PlayerCard;
- RatingBadge, TimeControlChip;
- CourseCard, LessonStepper, InstructionPanel;
- ExerciseFilter, SolutionDrawer;
- GameReviewBoard, EvaluationGraph futuro;
- Dialog, Drawer, Toast, Skeleton, ErrorState.

## Acessibilidade

- não depender apenas de vermelho/verde;
- foco visível;
- navegação por teclado no tabuleiro;
- nomes acessíveis para casas e peças;
- contraste WCAG AA;
- preferência de movimento reduzido.
