# ERD simplificado

```mermaid
erDiagram
  USERS ||--|| USER_PROFILES : has
  USERS ||--o{ USER_SESSIONS : owns
  USERS ||--o{ RATING_PROFILES : has
  USERS ||--o{ GAME_PLAYERS : plays
  GAMES ||--|{ GAME_PLAYERS : contains
  GAMES ||--o{ GAME_MOVES : records
  GAMES ||--o| GAME_PGN : exports
  GAMES ||--o{ RATING_TRANSACTIONS : produces
  COURSES ||--|{ COURSE_MODULES : contains
  COURSE_MODULES ||--|{ LESSONS : contains
  LESSONS ||--|{ LESSON_STEPS : contains
  USERS ||--o{ LESSON_ATTEMPTS : starts
  EXERCISES ||--o{ EXERCISE_ATTEMPTS : receives
  USERS ||--o{ EXERCISE_ATTEMPTS : performs
```

## Particionamento futuro

- `game_moves`: por hash de `game_id` ou faixa de `committed_at`.
- `games`: por mês de `created_at` após volume elevado.
- `audit_logs`: por mês.
- `exercise_attempts`: por mês ou hash de usuário.
