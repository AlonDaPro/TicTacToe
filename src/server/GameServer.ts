import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import WebSocket from 'ws';
import {
  DrawMessage,
  ErrorMessage,
  GameCancelledMessage,
  GameMessage,
  GameStartMessage,
  JoinMessage,
  LeaveMessage,
  MessageType,
  MoveMessage,
  RedirectMessage,
  UpdateMessage,
  WinMessage
} from '../models/Messages';
import { GameResult, GameStatus } from '../models/MessageTypes';
import { TicTacToeService } from '../services/TicTacToeService';
import { WebSocketFederationService } from '../services/WebSocketFederationService';
import { SERVER_CONSTANTS } from '../utils/constants';

/**
 * WebSocket game server for real-time Tic-Tac-Toe with federation support
 */
export class GameServer {
  private wss: WebSocket.Server;
  private gameService: TicTacToeService;
  private federationService?: WebSocketFederationService;
  private serverId: string;
  private clients: Map<string, WebSocket> = new Map(); // clientId -> ws
  private clientGames: Map<WebSocket, string> = new Map(); // ws -> gameId

  constructor(port: number, serverId: string, gameService: TicTacToeService) {
    this.serverId = serverId;
    this.gameService = gameService;

    this.wss = new WebSocket.Server({
      port,
      perMessageDeflate: false,
    });

    this.setupWebSocketHandlers();
    console.log(`🎮 Tic-Tac-Toe Server ${serverId} on port ${port}`);
  }

  /**
   * Set the federation service for inter-server communication
   */
  setFederationService(federationService: WebSocketFederationService): void {
    this.federationService = federationService;
  }

  /**
   * Set up WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws: WebSocket, request) => {
      const url = new URL(request.url || '', 'http://localhost');

      // Debug logging
      console.log(`Server ${this.serverId}: Connection received - URL: ${request.url}, Pathname: ${url.pathname}`);

      // Check if this is a federation connection
      if (url.pathname === '/federation') {
        console.log(`Server ${this.serverId}: New federation peer connected`);
        this.handleFederationConnection(ws);
        return;
      }

      // Check if this is a load balancing query
      if (url.pathname === '/status') {
        console.log(`Server ${this.serverId}: New status query`);
        this.handleStatusRequest(ws);
        return;
      }

      // Regular client connection
      console.log(`Server ${this.serverId}: New client connected`);

      ws.on('message', (data: WebSocket.RawData) => {
        this.handleMessage(ws, data);
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      ws.on('error', (error) => {
        console.error(`Server ${this.serverId}: WebSocket error:`, error);
      });
    });

    this.wss.on('error', (error) => {
      console.error(`Server ${this.serverId}: WebSocket server error:`, error);
    });
  }

  /**
   * Handle federation peer connections
   */
  private handleFederationConnection(ws: WebSocket): void {
    if (this.federationService && 'handleFederationPeerConnection' in this.federationService) {
      // Pass the connection to the federation service
      (this.federationService as any).handleFederationPeerConnection(ws);
    }
  }

  /**
   * Handle status request for load balancing
   */
  private handleStatusRequest(ws: WebSocket): void {
    try {
      const stats = this.getStats();
      const federationStats = this.federationService?.getFederationStats();

      // Count games that are available (have 0 or 1 players)
      const games = this.gameService.getActiveGames();
      const availableGames = games.filter(game => game.players.length < 2).length;

      // Include list of available game IDs for better load balancing
      const availableGameIds = games
        .filter(game => game.players.length < 2)
        .map(game => game.id);

      const statusResponse = {
        serverId: stats.serverId,
        port: stats.port,
        connectedClients: stats.connectedClients,
        activeGames: stats.activeGames,
        availableGames: availableGames,
        availableGameIds: availableGameIds,
        isFederated: federationStats?.isFederated || false,
        peers: federationStats?.peers || []
      };

      // Send status response and close connection
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(statusResponse));
        setTimeout(() => {
          ws.close();
        }, 100); // Small delay to ensure message is sent
      }
    } catch (error) {
      console.error(`${this.serverId}: Error handling status request:`, error);
      ws.close();
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(ws: WebSocket, data: WebSocket.RawData): Promise<void> {
    try {
      const messageStr = data.toString();
      const messageData = JSON.parse(messageStr);

      // Validate and transform the message
      const message = await this.parseMessage(messageData);

      if (!message) {
        this.sendError(ws, 'Invalid message format');
        return;
      }

      // Handle different message types
      switch (message.type) {
        case MessageType.JOIN:
          await this.handleJoin(ws, message as JoinMessage);
          break;
        case MessageType.MOVE:
          await this.handleMove(ws, message as MoveMessage);
          break;
        case MessageType.LEAVE:
          await this.handleLeave(ws, message as LeaveMessage);
          break;
        default:
          this.sendError(ws, `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error(`Server ${this.serverId}: Error handling message:`, error);
      this.sendError(ws, 'Failed to process message');
    }
  }

  /**
   * Parse and validate incoming message
   */
  private async parseMessage(data: any): Promise<GameMessage | null> {
    try {
      switch (data.type) {
        case MessageType.JOIN: {
          const message = plainToClass(JoinMessage, data);
          const errors = await validate(message);
          if (errors.length > 0) {
            console.warn(`Server ${this.serverId}: Validation errors:`, errors);
            return null;
          }
          return (message as unknown as JoinMessage[])[0] || message as unknown as JoinMessage;
        }
        case MessageType.MOVE: {
          const message = plainToClass(MoveMessage, data);
          const errors = await validate(message);
          if (errors.length > 0) {
            console.warn(`Server ${this.serverId}: Validation errors:`, errors);
            return null;
          }
          return (message as unknown as MoveMessage[])[0] || message as unknown as MoveMessage;
        }
        case MessageType.LEAVE: {
          const message = plainToClass(LeaveMessage, data);
          const errors = await validate(message);
          if (errors.length > 0) {
            console.warn(`Server ${this.serverId}: Validation errors:`, errors);
            return null;
          }
          return (message as unknown as LeaveMessage[])[0] || message as unknown as LeaveMessage;
        }
        default:
          return null;
      }
    } catch (error) {
      console.error(`Server ${this.serverId}: Failed to parse message:`, error);
      return null;
    }
  }

  /**
   * Handle join game message
   */
  private async handleJoin(ws: WebSocket, message: JoinMessage): Promise<void> {
    // Determine if we should find an existing game or create a new one
    let gameId = message.gameId || this.findAvailableGame();
    let isNewGame = false;

    // Check if we got a redirect to a federated server
    if (gameId && gameId.startsWith('redirect:')) {
      const [, serverId, remoteGameId] = gameId.split(':');
      console.log(`Server ${this.serverId}: Redirecting player to server ${serverId} for game ${remoteGameId}`);

      // Calculate the port for the remote server
      // Server1 = port 3001, Server2 = port 3002, etc.
      const serverIndex = parseInt(serverId.replace('Server', ''));
      const remotePort = SERVER_CONSTANTS.FEDERATION_PORT_OFFSET + serverIndex;

      // Create and send redirect message using proper class
      const redirectMessage = new RedirectMessage(
        serverId,
        remotePort,
        remoteGameId,
        `Connecting you to server ${serverId} where your game is waiting`
      );

      this.sendMessage(ws, redirectMessage);
      ws.close(); // Close connection after redirect
      return;
    }

    if (!gameId) {
      // Create a new game if none available
      const newGame = this.gameService.createGame();
      gameId = newGame.id;
      isNewGame = true;
    }

    // Generate player ID if not provided
    const playerId = message.playerId || this.generatePlayerId();

    // Get game state BEFORE adding player
    const gameBefore = this.gameService.getGame(gameId);
    const playersBefore = gameBefore?.players.length || 0;

    // Add player to game
    const result = this.gameService.addPlayerToGame(
      gameId,
      playerId,
      message.preferredSymbol,
      this.serverId
    );

    if (!result.success) {
      this.sendError(ws, result.error || 'Failed to join game');
      return;
    }

    // Track client connections
    this.clients.set(playerId, ws);
    this.clientGames.set(ws, gameId);

    const game = result.game!;
    const player = game.getPlayer(playerId)!;

    // Check if this is the second player joining (game now starts)
    if (playersBefore === 1 && game.players.length === 2) {
      // This is the second player joining - game can start
      game.players.forEach(gamePlayer => {
        const opponent = game.getOpponent(gamePlayer.id)!;
        const gameStartMessage = new GameStartMessage(
          gamePlayer.symbol,
          opponent.symbol,
          gameId
        );

        const clientWs = this.clients.get(gamePlayer.id);
        if (clientWs && clientWs.readyState === WebSocket.OPEN) {
          this.sendMessage(clientWs, gameStartMessage);
        }
      });

      console.log(`Server ${this.serverId}: Game ${gameId} started with 2 players`);
    } else {
      // Still waiting for opponent
      const status = isNewGame ? 'created new game' : 'joined existing game';
      console.log(`Server ${this.serverId}: Player ${playerId} ${status} ${gameId} - waiting for opponent`);
    }

    // Send current game state (this will show the board and waiting status)
    this.broadcastGameState(gameId);

    // Broadcast to federation
    if (this.federationService) {
      await this.federationService.broadcastPlayerJoined(
        playerId,
        player.symbol,
        gameId
      );
    }
  }

  /**
   * Handle move message
   */
  private async handleMove(ws: WebSocket, message: MoveMessage): Promise<void> {
    const gameId = message.gameId || this.getGameIdForClient(ws);

    if (!gameId) {
      this.sendError(ws, 'No game associated with client');
      return;
    }

    const result = this.gameService.makeMove(
      gameId,
      message.playerId,
      message.row,
      message.col
    );

    if (!result.success) {
      this.sendError(ws, result.error || 'Invalid move');
      return;
    }

    // Broadcast updated game state
    this.broadcastGameState(result.game!.id);

    // Broadcast move to federation
    if (this.federationService) {
      await this.federationService.broadcastMove(
        message.playerId,
        message.row,
        message.col,
        gameId
      );
    }

    // Send win/draw messages if game finished
    if (result.isGameFinished && result.game) {
      this.sendGameEndMessages(result.game);
    }
  }

  /**
   * Handle leave game message
   */
  private async handleLeave(ws: WebSocket, message: LeaveMessage): Promise<void> {
    const gameId = this.getGameIdForClient(ws) || message.gameId;

    if (gameId) {
      const game = this.gameService.getGame(gameId);
      const wasPlaying = game?.status === GameStatus.PLAYING;

      // Remove player from game
      this.gameService.removePlayerFromGame(message.playerId);

      // Reset the game if a player left mid-game
      if (wasPlaying && game) {
        console.log(`Server ${this.serverId}: Player left mid-game, resetting game ${gameId}`);

        // Reset game state to waiting, respecting board size
        game.status = GameStatus.WAITING;
        game.players = [];
        game.nextTurn = undefined;
        game.winner = undefined;
        game.result = GameResult.ONGOING;
        game.board = Array.from({ length: game.boardSize }, () => Array.from({ length: game.boardSize }, () => null));
      }

      // Broadcast updated game state
      this.broadcastGameState(gameId);

      // Broadcast to federation
      if (this.federationService) {
        await this.federationService.broadcastPlayerLeft(message.playerId, gameId);
      }
    }

    // Clean up client tracking
    this.cleanupClient(ws);
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnect(ws: WebSocket): void {
    this.cleanupClient(ws);
  }

  /**
   * Clean up disconnected client
   */
  private cleanupClient(ws: WebSocket): void {
    const gameId = this.clientGames.get(ws);
    this.clientGames.delete(ws);

    // Find and remove the player
    for (const [playerId, clientWs] of this.clients.entries()) {
      if (clientWs === ws) {
        this.clients.delete(playerId);

        if (gameId) {
          const game = this.gameService.removePlayerFromGame(playerId);
          // If game was in progress, cancel and notify remaining player
          if (game && game.status === GameStatus.PLAYING) {
            game.status = GameStatus.FINISHED;
            game.result = GameResult.ONGOING; // indicate cancelled/not completed

            const opponent = game.players[0];
            if (opponent) {
              const clientWs = this.clients.get(opponent.id);
              if (clientWs && clientWs.readyState === WebSocket.OPEN) {
                const cancelMsg = new GameCancelledMessage(game.id, 'Opponent disconnected. Returning to lobby.');
                this.sendMessage(clientWs, cancelMsg);
              }
              // Remove opponent mapping to return them to lobby
              this.clientGames.delete(clientWs!);
            }
          } else if (gameId) {
            this.broadcastGameState(gameId);
          }

          // Broadcast to federation
          if (this.federationService) {
            this.federationService.broadcastPlayerLeft(playerId, gameId).catch(console.error);
          }
        }
        break;
      }
    }
  }

  /**
   * Broadcast current game state to all players in the game
   */
  private broadcastGameState(gameId: string): void {
    const game = this.gameService.getGame(gameId);
    if (!game) return;

    const stateSummary = game.getStateSummary();
    const updateMessage = new UpdateMessage(
      stateSummary.board,
      stateSummary.nextTurn,
      gameId,
      stateSummary.winner,
      stateSummary.players
    );

    // Send to all clients in this game
    game.players.forEach(player => {
      const ws = this.clients.get(player.id);
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, updateMessage);
      }
    });
  }

  /**
   * Send game end messages (win/draw)
   */
  private sendGameEndMessages(game: any): void {
    let endMessage: WinMessage | DrawMessage;

    if (game.result === GameResult.WIN && game.winner) {
      endMessage = new WinMessage(game.winner, game.id, game.winningLine);
    } else if (game.result === GameResult.DRAW) {
      endMessage = new DrawMessage(game.id);
    } else {
      return; // Game not finished
    }

    // Send to all clients in this game
    game.players.forEach((player: any) => {
      const ws = this.clients.get(player.id);
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, endMessage);
      }
    });
  }

  /**
   * Send error message to client
   */
  private sendError(ws: WebSocket, message: string): void {
    const errorMessage = new ErrorMessage(message);
    this.sendMessage(ws, errorMessage);
  }

  /**
   * Send message to WebSocket client
   */
  private sendMessage(ws: WebSocket, message: GameMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Server ${this.serverId}: Failed to send message:`, error);
      }
    }
  }

  /**
   * Find an available game (waiting for players) from local or federated servers
   * This method ensures clients can join existing games before creating new ones
   * @returns gameId or "redirect:<server>:<gameId>" for federated games
   */
  private findAvailableGame(): string | null {
    const activeGames = this.gameService.getActiveGames();

    // Priority 1: Local games with exactly 1 player (waiting for second player)
    const gamesWithOnePlayer = activeGames.filter(game => game.players.length === 1);
    if (gamesWithOnePlayer.length > 0) {
      return gamesWithOnePlayer[0].id;
    }

    // Priority 2: Local games with 0 players (newly created, waiting)
    const emptyGames = activeGames.filter(game => game.players.length === 0);
    if (emptyGames.length > 0) {
      return emptyGames[0].id;
    }

    // Priority 3: Check global available games from federated servers
    if (this.federationService && this.federationService.isFederationActive()) {
      const globalGames = this.federationService.getGlobalAvailableGames();
      for (const [gameId, gameInfo] of globalGames.entries()) {
        if (gameInfo.playerCount === 1) {
          // Found a federated game - return redirect info
          return `redirect:${gameInfo.serverId}:${gameId}`;
        }
      }
    }

    // No available games found locally or globally
    return null;
  }

  /**
   * Generate unique player ID
   */
  private generatePlayerId(): string {
    return `player_${this.serverId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get game ID for a client WebSocket
   */
  private getGameIdForClient(ws: WebSocket): string | null {
    return this.clientGames.get(ws) || null;
  }

  /**
   * Get server statistics
   */
  getStats(): {
    serverId: string;
    port: number;
    connectedClients: number;
    activeGames: number;
  } {
    return {
      serverId: this.serverId,
      port: (this.wss.address() as any)?.port || 0,
      connectedClients: this.clients.size,
      activeGames: this.gameService.getActiveGames().length,
    };
  }

  /**
   * Close the server
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(() => {
        console.log(`Server ${this.serverId}: WebSocket server closed`);
        resolve();
      });
    });
  }
}
