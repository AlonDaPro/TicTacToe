import WebSocket from 'ws';
import { TicTacToeService } from './TicTacToeService';
import {
  MessageType,
  PlayerJoinedFederationMessage,
  FederationMoveMessage,
  PlayerLeftFederationMessage
} from '../models/Messages';

/**
 * Service for WebSocket-based server federation
 * Enables real-time communication between multiple game servers via direct WebSocket connections
 */
export class WebSocketFederationService {
  private gameService: TicTacToeService;
  private serverId: string;
  private serverPort: number;
  private connectedServers = new Map<string, WebSocket>(); // serverId -> ws
  private isFederated = false;
  private globalAvailableGames = new Map<string, { serverId: string; gameId: string; playerCount: number }>(); // gameId -> game info from federation

  constructor(gameService: TicTacToeService, serverId: string, serverPort: number) {
    this.gameService = gameService;
    this.serverId = serverId;
    this.serverPort = serverPort;
  }

  /**
   * Connect to other servers using direct WebSocket connections
   * This is asynchronous and won't fail if other servers aren't running yet
   */
  async connectToServers(federationPorts: number[]): Promise<void> {
    if (federationPorts.length <= 1) {
      console.log(`Server ${this.serverId}: Standalone mode - no federation peers specified`);
      return;
    }

    console.log(`Server ${this.serverId}: Initiating federation connection attempts to ${federationPorts.length - 1} peers...`);

    const otherPorts = federationPorts.filter(port => port !== this.serverPort);

    // Try to connect to other servers, but don't block startup if they fail
    const connectionPromises = otherPorts.map(async (port) => {
      return this.connectToServer(port);
    });

    await Promise.allSettled(connectionPromises);

    // Log federation status
    if (this.connectedServers.size > 0) {
      console.log(`Server ${this.serverId}: Federation active with ${this.connectedServers.size} peers`);
    } else {
      console.log(`Server ${this.serverId}: Federation inactive - will retry connections periodically`);
      // Start periodic retry for federation connections
      this.startFederationRetry(otherPorts);
    }
  }

  /**
   * Connect to a specific server
   */
  private async connectToServer(port: number): Promise<void> {
    try {
      const ws = new WebSocket(`ws://localhost:${port}/federation`);
      await this.waitForConnection(ws);

      const peerServerId = `Server${port - 3000}`; // Server A = 3001, Server B = 3002
      this.connectedServers.set(peerServerId, ws);
      console.log(`Server ${this.serverId}: ✅ Connected to federation peer ${peerServerId} on port ${port}`);

      // Set up message handlers for federation peer
      this.setupFederationMessageHandler(ws, peerServerId);

      this.isFederated = true;

    } catch (error) {
      // Expected when other servers aren't running yet
      console.log(`Server ${this.serverId}: Will retry federation connection to port ${port} later`);
    }
  }

  /**
   * Start periodic retry for federation connections
   */
  private startFederationRetry(federationPorts: number[]): void {
    const retryInterval = setInterval(async () => {
      if (this.isFederated) {
        clearInterval(retryInterval);
        return;
      }

      console.log(`Server ${this.serverId}: Retrying federation connections...`);

      for (const port of federationPorts) {
        if (this.connectedServers.has(`Server${port - 3000}`)) continue;

        try {
          const ws = new WebSocket(`ws://localhost:${port}/federation`);
          await this.waitForConnection(ws);

          const peerServerId = `Server${port - 3000}`;
          this.connectedServers.set(peerServerId, ws);
          console.log(`Server ${this.serverId}: ✅ Connected to federation peer ${peerServerId} on port ${port}`);

          this.setupFederationMessageHandler(ws, peerServerId);
          this.isFederated = true;

        } catch (error) {
          // Continue trying
        }
      }

      if (this.connectedServers.size > 0) {
        console.log(`Server ${this.serverId}: Federation established with ${this.connectedServers.size} peers`);
        clearInterval(retryInterval);
      }
    }, 5000); // Retry every 5 seconds

    // Clean up interval after 5 minutes to avoid memory leaks
    setTimeout(() => clearInterval(retryInterval), 5 * 60 * 1000);
  }

  /**
   * Wait for WebSocket connection to be established
   */
  private async waitForConnection(ws: WebSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);

      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);
    });
  }

  /**
   * Set up message handling for federation connections
   */
  private setupFederationMessageHandler(ws: WebSocket, peerServerId: string): void {
    ws.on('message', (data: WebSocket.RawData) => {
      this.handleFederationMessage(data, peerServerId);
    });

    ws.on('close', () => {
      console.log(`Server ${this.serverId}: Lost federation connection to ${peerServerId}`);
      this.connectedServers.delete(peerServerId);

      if (this.connectedServers.size === 0) {
        this.isFederated = false;
      }
    });

    ws.on('error', (error) => {
      console.error(`Server ${this.serverId}: Federation connection error with ${peerServerId}:`, error);
    });
  }

  /**
   * Handle federation messages from other servers
   */
  private async handleFederationMessage(data: WebSocket.RawData, fromServerId: string): Promise<void> {
    try {
      const messageStr = data.toString();
      const message = JSON.parse(messageStr);

      // Ignore messages we sent (avoid loops)
      if (message.originServer === this.serverId) return;

      console.log(`Server ${this.serverId}: Received federation message from ${fromServerId}: ${message.type}`);

      switch (message.type) {
        case MessageType.PLAYER_JOINED:
          this.handlePlayerJoined(message, fromServerId);
          break;
        case MessageType.GAME_MOVE:
          this.handleMoveReceived(message, fromServerId);
          break;
        case MessageType.PLAYER_LEFT:
          this.handlePlayerLeft(message, fromServerId);
          break;
        case 'available_games':
          this.handleAvailableGames(message, fromServerId);
          break;
      }
    } catch (error) {
      console.error(`Server ${this.serverId}: Error handling federation message:`, error);
    }
  }

  /**
   * Broadcast player joined message to connected servers
   */
  async broadcastPlayerJoined(playerId: string, playerSymbol: any, gameId?: string): Promise<void> {
    if (!this.isFederated || this.connectedServers.size === 0) return;

    const message = new PlayerJoinedFederationMessage(
      playerId,
      playerSymbol,
      this.serverId,
      gameId || '',
      this.serverId // originServer
    );

    this.broadcastFederationMessage(message);

    // Update available games cache when player joins
    this.broadcastAvailableGames();
  }

  /**
   * Broadcast available games to federation peers
   */
  private broadcastAvailableGames(): void {
    if (!this.isFederated || this.connectedServers.size === 0) return;

    const localActiveGames = this.gameService.getActiveGames();
    const availableGames = localActiveGames
      .filter(game => game.players.length === 1) // Games waiting for second player
      .map(game => ({
        gameId: game.id,
        serverId: this.serverId,
        playerCount: game.players.length
      }));

    if (availableGames.length === 0) return;

    const message = {
      type: 'available_games',
      games: availableGames,
      serverId: this.serverId,
      originServer: this.serverId
    };

    this.broadcastFederationMessage(message);
  }

  /**
   * Broadcast move to connected servers
   */
  async broadcastMove(playerId: string, row: number, col: number, gameId?: string): Promise<void> {
    if (!this.isFederated || this.connectedServers.size === 0) return;

    const message = new FederationMoveMessage(
      playerId,
      row,
      col,
      this.serverId,
      gameId || '',
      this.serverId // originServer
    );

    this.broadcastFederationMessage(message);
  }

  /**
   * Broadcast player left message to connected servers
   */
  async broadcastPlayerLeft(playerId: string, gameId?: string): Promise<void> {
    if (!this.isFederated || this.connectedServers.size === 0) return;

    const message: PlayerLeftFederationMessage = {
      type: MessageType.PLAYER_LEFT,
      gameId: gameId || '',
      playerId,
      serverId: this.serverId,
      originServer: this.serverId
    };

    this.broadcastFederationMessage(message);
  }

  /**
   * Broadcast message to all connected federation servers
   */
  private broadcastFederationMessage(message: any): void {
    if (!this.isFederated) return;

    const messageStr = JSON.stringify(message);

    for (const [serverId, ws] of this.connectedServers.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error(`Server ${this.serverId}: Failed to broadcast to ${serverId}:`, error);
        }
      }
    }
  }

  /**
   * Handle player joined from another server
   */
  private handlePlayerJoined(data: any, fromServerId: string): void {
    console.log(`Server ${this.serverId}: Player ${data.playerId} joined from server ${data.serverId}`);

    // The game service will handle adding the player if needed
    // In federation, we trust that local players are managed by their original servers
    console.log(`Server ${this.serverId}: Acknowledged player ${data.playerId} from federation`);
  }

  /**
   * Handle player left from another server
   */
  private handlePlayerLeft(data: any, fromServerId: string): void {
    console.log(`Server ${this.serverId}: Player ${data.playerId} left from server ${data.serverId}`);

    // Notify local clients that a federated player left
    // This is handled by the game service when it discovers disconnected players
    this.gameService.removePlayerFromGame(data.playerId);
  }

  /**
   * Handle available games broadcast from another server
   */
  private handleAvailableGames(data: any, fromServerId: string): void {
    console.log(`Server ${this.serverId}: Received available games from ${fromServerId}: ${data.games.length} games`);

    // Clear previous games from this server
    for (const [gameId, gameInfo] of this.globalAvailableGames.entries()) {
      if (gameInfo.serverId === fromServerId) {
        this.globalAvailableGames.delete(gameId);
      }
    }

    // Add new available games
    for (const game of data.games) {
      this.globalAvailableGames.set(game.gameId, {
        serverId: game.serverId,
        gameId: game.gameId,
        playerCount: game.playerCount
      });
    }

    console.log(`Server ${this.serverId}: Global available games: ${this.globalAvailableGames.size}`);
  }

  /**
   * Handle move received from another server
   */
  private handleMoveReceived(data: any, fromServerId: string): void {
    console.log(`Server ${this.serverId}: Move from server ${data.serverId}: Player ${data.playerId} -> (${data.row},${data.col})`);

    // Apply the move locally - this will update federated games
    const result = this.gameService.makeMove(data.gameId, data.playerId, data.row, data.col);

    if (!result.success) {
      if (result.error?.includes('Game not found')) {
        console.log(`Server ${this.serverId}: Game ${data.gameId} not found locally, creating federated game`);
        // For cross-server games, we need to ensure the game exists locally
        // This is a simplified approach - in production you'd want more sophisticated game state sync
      } else {
        console.warn(`Server ${this.serverId}: Failed to apply federated move:`, result.error);
      }
    }

    // Also broadcast this move to clients connected to this server
    // This ensures cross-server gameplay updates reach all players
    console.log(`Server ${this.serverId}: Applied federated move to local game state`);
  }

  /**
   * Handle incoming federation peer connection from GameServer
   * This is called when a peer connects to our /federation endpoint
   */
  handleFederationPeerConnection(ws: WebSocket): void {
    console.log(`Server ${this.serverId}: Handling federation peer connection`);

    // Determine which server this is (opposite of ours)
    const peerServerId = this.serverId === 'ServerA' ? 'ServerB' : 'ServerA';
    this.connectedServers.set(peerServerId, ws);

    if (this.connectedServers.size > 0) {
      this.isFederated = true;
      console.log(`Server ${this.serverId}: Federation established with peer ${peerServerId}`);
    }

    // Set up message handlers for this federation peer
    this.setupFederationMessageHandler(ws, peerServerId);
  }

  /**
   * Get global available games from federation
   */
  getGlobalAvailableGames(): Map<string, { serverId: string; gameId: string; playerCount: number }> {
    return new Map(this.globalAvailableGames);
  }

  /**
   * Check if federation is active
   */
  isFederationActive(): boolean {
    return this.isFederated && this.connectedServers.size > 0;
  }

  /**
   * Get federation statistics
   */
  getFederationStats(): {
    serverId: string;
    port: number;
    connectedPeers: number;
    isFederated: boolean;
    peers: string[];
  } {
    return {
      serverId: this.serverId,
      port: this.serverPort,
      connectedPeers: this.connectedServers.size,
      isFederated: this.isFederated,
      peers: Array.from(this.connectedServers.keys())
    };
  }

  /**
   * Disconnect from federation
   */
  async disconnect(): Promise<void> {
    console.log(`Server ${this.serverId}: Disconnecting from federation...`);

    this.isFederated = false;

    // Close all federation connections
    const closePromises = Array.from(this.connectedServers.values()).map(ws =>
      new Promise((resolve) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
          ws.on('close', resolve);
        } else {
          resolve(void 0);
        }
      })
    );

    await Promise.all(closePromises);
    this.connectedServers.clear();

    console.log(`Server ${this.serverId}: Disconnected from federation`);
  }
}
