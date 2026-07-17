export class InvalidFenError extends Error {
  constructor(message = 'FEN inválida') {
    super(message);
    this.name = 'InvalidFenError';
  }
}

export class IllegalMoveError extends Error {
  constructor(message = 'Lance ilegal') {
    super(message);
    this.name = 'IllegalMoveError';
  }
}

export class InvalidUciError extends Error {
  constructor(message = 'UCI inválida') {
    super(message);
    this.name = 'InvalidUciError';
  }
}
