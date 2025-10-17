import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PlayerSymbol } from './MessageTypes';
import { MessageType } from './MessageTypes';
import { Type } from 'class-transformer';

// Re-export for convenience
export { MessageType } from './MessageTypes';

/**
 * Base message class
 */
export class BaseMessage {
  @IsIn(Object.values(MessageType))
  type: MessageType;

  @IsOptional()
  @IsString()
  gameId?: string;

  constructor(type: MessageType, gameId?: string) {
    this.type = type;
    this.gameId = gameId;
  }
}

/**
 * Client -> Server: Join game message
 */
export class JoinMessage extends BaseMessage {
  @IsOptional()
  @IsString()
  playerId?: string;

  @IsOptional()
  @IsIn([PlayerSymbol.X, PlayerSymbol.O])
  preferredSymbol?: PlayerSymbol;

  constructor(gameId?: string, playerId?: string, preferredSymbol?: PlayerSymbol) {
    super(MessageType.JOIN, gameId);
    this.playerId = playerId;
    this.preferredSymbol = preferredSymbol;
  }
}

/**
 * Client -> Server: Make move message
 */
export class MoveMessage extends BaseMessage {
  @IsNumber()
  @Min(0)
  row: number;

  @IsNumber()
  @Min(0)
  col: number;

  @IsString()
  playerId: string;

  constructor(row: number, col: number, playerId: string, gameId?: string) {
    super(MessageType.MOVE, gameId);
    this.row = row;
    this.col = col;
    this.playerId = playerId;
  }
}

/**
 * Client -> Server: Leave game message
 */
export class LeaveMessage extends BaseMessage {
  @IsString()
  playerId: string;

  constructor(playerId: string, gameId?: string) {
    super(MessageType.LEAVE, gameId);
    this.playerId = playerId;
  }
}

/**
 * Server -> Client: Game state update message
 */
export class UpdateMessage extends BaseMessage {
  board: (PlayerSymbol | null)[][];

  @IsIn([PlayerSymbol.X, PlayerSymbol.O, null])
  nextTurn: PlayerSymbol | null;

  @IsString()
  @IsOptional()
  winner?: PlayerSymbol;

  @IsOptional()
  @Type(() => String)
  players?: { [key: string]: PlayerSymbol };

  constructor(
    board: (PlayerSymbol | null)[][],
    nextTurn: PlayerSymbol | null,
    gameId?: string,
    winner?: PlayerSymbol,
    players?: { [key: string]: PlayerSymbol }
  ) {
    super(MessageType.UPDATE, gameId);
    this.board = board;
    this.nextTurn = nextTurn;
    this.winner = winner;
    this.players = players;
  }
}

/**
 * Server -> Client: Win message
 */
export class WinMessage extends BaseMessage {
  @IsIn([PlayerSymbol.X, PlayerSymbol.O])
  winner: PlayerSymbol;

  @IsOptional()
  @Type(() => Number)
  winningLine?: number[];

  constructor(winner: PlayerSymbol, gameId?: string, winningLine?: number[]) {
    super(MessageType.WIN, gameId);
    this.winner = winner;
    this.winningLine = winningLine;
  }
}

/**
 * Server -> Client: Draw message
 */
export class DrawMessage extends BaseMessage {
  constructor(gameId?: string) {
    super(MessageType.DRAW, gameId);
  }
}

/**
 * Server -> Client: Game cancelled (opponent disconnected)
 */
export class GameCancelledMessage extends BaseMessage {
  @IsString()
  reason: string;

  constructor(gameId: string, reason: string) {
    super(MessageType.GAME_CANCELLED, gameId);
    this.reason = reason;
  }
}

/**
 * Server -> Client: Error message
 */
export class ErrorMessage extends BaseMessage {
  @IsString()
  message: string;

  constructor(message: string, gameId?: string) {
    super(MessageType.ERROR, gameId);
    this.message = message;
  }
}

/**
 * Server -> Client: Game start message
 */
export class GameStartMessage extends BaseMessage {
  @IsIn([PlayerSymbol.X, PlayerSymbol.O])
  yourSymbol: PlayerSymbol;

  @IsIn([PlayerSymbol.X, PlayerSymbol.O])
  opponentSymbol: PlayerSymbol;

  constructor(yourSymbol: PlayerSymbol, opponentSymbol: PlayerSymbol, gameId?: string) {
    super(MessageType.GAME_START, gameId);
    this.yourSymbol = yourSymbol;
    this.opponentSymbol = opponentSymbol;
  }
}

/**
 * Server -> Client: Redirect message (for cross-server game discovery)
 */
export class RedirectMessage extends BaseMessage {
  @IsString()
  serverId: string;

  @IsNumber()
  @Min(1024)
  port: number;

  @IsString()
  gameId: string;

  @IsString()
  message: string;

  constructor(serverId: string, port: number, gameId: string, message: string) {
    super(MessageType.REDIRECT);
    this.serverId = serverId;
    this.port = port;
    this.gameId = gameId;
    this.message = message;
  }
}

/**
 * Server -> Server: Player joined federation message
 */
export class PlayerJoinedFederationMessage extends BaseMessage {
  @IsString()
  playerId: string;

  @IsIn([PlayerSymbol.X, PlayerSymbol.O])
  playerSymbol: PlayerSymbol;

  @IsString()
  serverId: string;

  @IsOptional()
  @IsString()
  originServer?: string; // Track where the message originated to prevent loops

  constructor(playerId: string, playerSymbol: PlayerSymbol, serverId: string, gameId?: string, originServer?: string) {
    super(MessageType.PLAYER_JOINED, gameId);
    this.playerId = playerId;
    this.playerSymbol = playerSymbol;
    this.serverId = serverId;
    this.originServer = originServer;
  }
}

/**
 * Server -> Server: Federation move message
 */
export class FederationMoveMessage extends BaseMessage {
  @IsString()
  playerId: string;

  @IsNumber()
  @Min(0)
  row: number;

  @IsNumber()
  @Min(0)
  col: number;

  @IsString()
  serverId: string;

  @IsOptional()
  @IsString()
  originServer?: string; // Track where the message originated to prevent loops

  constructor(playerId: string, row: number, col: number, serverId: string, gameId?: string, originServer?: string) {
    super(MessageType.GAME_MOVE, gameId);
    this.playerId = playerId;
    this.row = row;
    this.col = col;
    this.serverId = serverId;
    this.originServer = originServer;
  }
}

/**
 * Server -> Server: Player left federation message
 */
export class PlayerLeftFederationMessage extends BaseMessage {
  @IsString()
  playerId: string;

  @IsString()
  serverId: string;

  @IsOptional()
  @IsString()
  originServer?: string; // Track where the message originated to prevent loops

  constructor(playerId: string, serverId: string, gameId?: string, originServer?: string) {
    super(MessageType.PLAYER_LEFT, gameId);
    this.playerId = playerId;
    this.serverId = serverId;
    this.originServer = originServer;
  }
}

/**
 * Union type for all message types
 */
export type GameMessage =
  | JoinMessage
  | MoveMessage
  | LeaveMessage
  | UpdateMessage
  | WinMessage
  | DrawMessage
  | GameCancelledMessage
  | ErrorMessage
  | GameStartMessage
  | PlayerJoinedFederationMessage
  | FederationMoveMessage
  | PlayerLeftFederationMessage;
