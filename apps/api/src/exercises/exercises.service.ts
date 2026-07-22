import type {
  EvaluateExerciseLineInput,
  ExerciseSearchQuery,
  StartExerciseTrainingInput,
  SubmitExerciseAttemptInput,
} from '@xadrez/contracts';
import { Injectable } from '@nestjs/common';

import { ExercisesRepository } from './exercises.repository.js';

@Injectable()
export class ExercisesService {
  constructor(private readonly exercises: ExercisesRepository) {}

  search(query: ExerciseSearchQuery) {
    return this.exercises.search(query);
  }

  startTraining(userId: string, input: StartExerciseTrainingInput) {
    return this.exercises.startTraining(userId, input.filters);
  }

  training(userId: string, sessionId: string) {
    return this.exercises.training(userId, sessionId);
  }

  hint(userId: string, sessionId: string) {
    return this.exercises.hint(userId, sessionId);
  }

  solution(userId: string, sessionId: string) {
    return this.exercises.solution(userId, sessionId);
  }

  attempt(userId: string, exerciseId: string, input: SubmitExerciseAttemptInput) {
    return this.exercises.attempt(userId, exerciseId, input);
  }

  evaluateLine(userId: string, exerciseId: string, input: EvaluateExerciseLineInput) {
    return this.exercises.evaluateLine(userId, exerciseId, input);
  }

  studyContext(exerciseId: string) {
    return this.exercises.studyContext(exerciseId);
  }

  metrics(userId: string) {
    return this.exercises.metrics(userId);
  }
}
