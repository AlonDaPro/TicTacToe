/**
 * Application constants and configuration
 */

// Game configuration
export const GAME_CONSTANTS = {
  BOARD_SIZE: 3,
  BOARD_ROWS: 3,
  BOARD_COLS: 3,
  WINNING_LENGTH: 3,
} as const;

// Server configuration
export const SERVER_CONSTANTS = {
  SERVER_A_PORT: 3001,
  SERVER_A_ID: 'ServerA',
  SERVER_B_PORT: 3002,
  SERVER_B_ID: 'ServerB',
  FEDERATION_PORT_OFFSET: 3000, // ServerA = 3000 + 1, ServerB = 3000 + 2
} as const;

// Network configuration
export const NETWORK_CONSTANTS = {
  CONNECTION_TIMEOUT: 5000, // 5 seconds
  STATUS_POLL_TIMEOUT: 2000, // 2 seconds
  FEDERATION_RETRY_INTERVAL: 5000, // 5 seconds
  FEDERATION_CLEANUP_TIMEOUT: 5 * 60 * 1000, // 5 minutes
  CLIENT_TIMEOUT: 10000, // 10 seconds
} as const;

// URLs
export const URL_CONSTANTS = {
  LOCALHOST: 'localhost',
  WS_PROTOCOL: 'ws://',
  STATUS_ENDPOINT: '/status',
  FEDERATION_ENDPOINT: '/federation',
  SERVER_A_URL: `ws://localhost:${SERVER_CONSTANTS.SERVER_A_PORT}`,
  SERVER_B_URL: `ws://localhost:${SERVER_CONSTANTS.SERVER_B_PORT}`,
} as const;

// Validation limits
export const VALIDATION_CONSTANTS = {
  MAX_ROW_COL_VALUE: 2,
  MIN_ROW_COL_VALUE: 0,
  MAX_CLIENTS_PER_SERVER: 100,
  MAX_GAME_ID_LENGTH: 50,
  MAX_PLAYER_ID_LENGTH: 50,
} as const;

// Player symbols
export const PLAYER_CONSTANTS = {
  SYMBOL_X: 'X' as const,
  SYMBOL_O: 'O' as const,
} as const;

// Game logic
export const GAME_LOGIC = {
  MAX_PLAYERS_PER_GAME: 2,
  MIN_PLAYERS_TO_START: 2,
  RESUME_WAIT_TIME: 3000, // 3 seconds
  CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes
  STATS_LOG_INTERVAL: 60 * 1000, // 1 minute
} as const;

// Error messages
export const ERROR_MESSAGES = {
  GAME_NOT_FOUND: 'Game not found',
  INVALID_MOVE: 'Invalid move',
  NOT_YOUR_TURN: 'Not your turn',
  GAME_FULL: 'Game is full',
  PLAYER_NOT_IN_GAME: 'Player not in game',
  CONNECTION_TIMEOUT: 'Connection timeout',
  INVALID_FORMAT: 'Invalid format. Use format: row,col (e.g., 1,2)',
  INVALID_COORDINATES: 'Invalid coordinates. Row and column must be 0-2.',
  NO_GAME_ASSOCIATED: 'No game associated with client',
  FAILED_TO_JOIN: 'Failed to join game',
} as const;

// Federation messages
export const FEDERATION_MESSAGES = {
  NO_AVAILABLE_GAMES: 'No available games found on this server. This could happen if all games are full. Try restarting the client to be reconnected to a different server.',
  WILL_RETRY_CONNECTION: 'Will retry federation connection to port',
} as const;

// Interfaces
export interface ServerStats {
  serverId: string;
  port: number;
  connectedClients: number;
  activeGames: number;
  availableGames: number;
  availableGameIds?: string[];
  isFederated: boolean;
  peers: string[];
}

export interface GameInfo {
  serverId: string;
  gameId: string;
  playerCount: number;
  isAvailable: boolean;
}

export interface FederationPeer {
  serverId: string;
  port: number;
  url: string;
  status: 'connecting' | 'connected' | 'disconnected';
}
