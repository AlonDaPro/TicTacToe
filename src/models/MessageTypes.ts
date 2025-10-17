/**
 * WebSocket message types for client-server communication
 */
export enum MessageType {
  // Client -> Server
  JOIN = 'join',
  MOVE = 'move',
  LEAVE = 'leave',

  // Server -> Client
  UPDATE = 'update',
  WIN = 'win',
  DRAW = 'draw',
  ERROR = 'error',
  GAME_START = 'gameStart',
  REDIRECT = 'redirect',

  // Server -> Server (federation)
  PLAYER_JOINED = 'playerJoined',
  PLAYER_LEFT = 'playerLeft',
  GAME_MOVE = 'gameMove',
  GAME_STATE_UPDATE = 'gameStateUpdate',
  AVAILABLE_GAMES = 'available_games',
  GAME_CANCELLED = 'gameCancelled'
}

/**
 * Player symbols for Tic-Tac-Toe
 */
export enum PlayerSymbol {
  X = 'X',
  O = 'O'
}

/**
 * Game status
 */
export enum GameStatus {
  WAITING = 'waiting',
  PLAYING = 'playing',
  FINISHED = 'finished'
}

/**
 * Game result
 */
export enum GameResult {
  WIN = 'win',
  DRAW = 'draw',
  ONGOING = 'ongoing'
}
