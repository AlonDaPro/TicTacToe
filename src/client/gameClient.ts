import * as readline from 'readline';
import WebSocket from 'ws';
import {
  DrawMessage,
  ErrorMessage,
  GameCancelledMessage,
  GameStartMessage,
  JoinMessage,
  LeaveMessage,
  MessageType,
  MoveMessage,
  RedirectMessage,
  UpdateMessage,
  WinMessage
} from '../models/Messages';
import { PlayerSymbol } from '../models/MessageTypes';
import { ERROR_MESSAGES } from '../utils/constants';

/**
 * CLI-based Tic-Tac-Toe game client
 */
export class GameClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private playerId: string;
  private rl: readline.Interface;
  private isConnected = false;
  private gameId: string | null = null;
  private mySymbol: PlayerSymbol | null = null;
  private opponentSymbol: PlayerSymbol | null = null;
  private board: (PlayerSymbol | null)[][] = [];
  private nextTurn: PlayerSymbol | null = null;
  private currentPlayers: { [key: string]: PlayerSymbol } = {};
  private gameHasStarted: boolean = false; // Track if we were in an active 2-player game
  private isRedirecting: boolean = false; // Suppress exit on close during redirect
  private pendingGameToJoin: string | null = null; // Auto-join after redirect

  constructor(serverUrl: string = 'ws://localhost:3001') {
    this.serverUrl = serverUrl;
    this.playerId = this.generatePlayerId();

    // Initialize board
    this.initializeBoard();

    // Set up readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> '
    });

    // Handle process termination
    process.on('SIGINT', () => {
      this.handleExit();
    });
  }

  /**
   * Connect to the game server
   */
  async connect(): Promise<void> {
    try {
      console.log(`Connecting to ${this.serverUrl}...`);
      this.ws = new WebSocket(this.serverUrl);

      return new Promise((resolve, reject) => {
        if (!this.ws) return reject(new Error('WebSocket not initialized'));

        this.ws.on('open', () => {
          this.isConnected = true;
          console.log('✅ Connected to game server!');
          if (!this.pendingGameToJoin) {
            this.showMainMenu();
          }
          resolve();
        });

        this.ws.on('message', (data: WebSocket.RawData) => {
          this.handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
          this.isConnected = false;
          if (this.isRedirecting) {
            // Expected close during redirect; suppress exit
            return;
          }
          console.log(`\n❌ Disconnected from server (code: ${code})`);
          if (reason.toString()) {
            console.log(`Reason: ${reason.toString()}`);
          }
          process.exit(1);
        });

        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);
      });
    } catch (error) {
      console.error('Failed to connect:', error);
      throw error;
    }
  }

  /**
   * Show main menu options
   */
  private showMainMenu(): void {
    console.log('\n🎮 Tic-Tac-Toe Game Client');
    console.log('Choose an option:');
    console.log('1. Join a new game');
    console.log('2. Join specific game (enter game ID)');
    console.log('3. Exit');

    if (!this.gameId) {
      this.rl.question('> ', (answer) => {
        this.handleMainMenuChoice(answer.trim());
      });
    }
  }

  /**
   * Handle main menu choices
   */
  private handleMainMenuChoice(choice: string): void {
    switch (choice) {
      case '1':
        this.joinNewGame();
        break;
      case '2':
        this.joinSpecificGame();
        break;
      case '3':
        this.handleExit();
        break;
      default:
        console.log('❌ Invalid choice. Please try again.');
        this.showMainMenu();
    }
  }

  /**
   * Join a game (find available game or create new)
   */
  private joinNewGame(): void {
    const joinMessage = new JoinMessage(undefined, this.playerId);
    this.sendMessage(joinMessage);
  }

  /**
   * Join a specific game by ID
   */
  private joinSpecificGame(): void {
    this.rl.question('Enter game ID: ', (gameId) => {
      if (!gameId.trim()) {
        console.log('❌ Game ID cannot be empty');
        this.showMainMenu();
        return;
      }

      const joinMessage = new JoinMessage(gameId.trim(), this.playerId);
      this.sendMessage(joinMessage);
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: WebSocket.RawData): void {
    try {
      const messageStr = data.toString();
      const message = JSON.parse(messageStr);

      switch (message.type) {
        case MessageType.GAME_START:
          this.handleGameStart(message);
          break;
        case MessageType.UPDATE:
          this.handleGameUpdate(message);
          break;
        case MessageType.WIN:
          this.handleWin(message);
          break;
        case MessageType.DRAW:
          this.handleDraw(message);
          break;
        case MessageType.GAME_CANCELLED:
          this.handleCancelled(message);
          break;
        case MessageType.ERROR:
          this.handleError(message);
          break;
        case MessageType.REDIRECT:
          this.handleRedirect(message);
          break;
        default:
          console.log('Received unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  /**
   * Handle game start message
   */
  private handleGameStart(message: GameStartMessage): void {
    this.gameId = message.gameId!;
    this.mySymbol = message.yourSymbol;
    this.opponentSymbol = message.opponentSymbol;

    console.log(`\n🎉 Game started! You are player ${this.mySymbol}`);
    console.log(`Your opponent is player ${this.opponentSymbol}`);
    console.log('Game ID:', this.gameId);
    console.log('\nWaiting for opponent...\n');
  }

  /**
   * Handle game update message
   */
  private handleGameUpdate(message: UpdateMessage): void {
    // Update game state
    this.board = message.board;
    this.nextTurn = message.nextTurn;
    const oldPlayerCount = Object.keys(this.currentPlayers).length;
    this.currentPlayers = message.players || {};
    const newPlayerCount = Object.keys(this.currentPlayers).length;

    // Display current game state
    this.displayBoard();

    if (message.winner) {
      console.log(`🏆 Player ${message.winner} wins!`);
      console.log('Game over. Press Ctrl+C to exit.');
      this.resetGame();
      return;
    }

    // Check if a player left mid-game (only if we were in a 2-player game)
    if (oldPlayerCount === 2 && newPlayerCount < 2) {
      console.log('\n⚠️  A player left the game. Waiting for another player to join...');
      console.log('Game will restart when another player joins.');
      this.gameHasStarted = false;
      this.resetGame();
      return;
    }

    // Check if game can start (has 2 players)
    if (newPlayerCount === 2 && !this.gameHasStarted) {
      this.gameHasStarted = true;
      console.log('🎉 Second player joined! Game is now starting.');
    }

    // Check if it's our turn
    if (newPlayerCount === 2 && this.nextTurn === this.mySymbol) {
      this.makeMove();
    } else if (newPlayerCount < 2) {
      console.log('⏳ Waiting for another player to join...');
    } else if (this.nextTurn && this.nextTurn !== this.mySymbol) {
      console.log(`⏳ Waiting for player ${this.nextTurn} to make a move...`);
    }
  }

  /**
   * Handle win message
   */
  private handleWin(message: WinMessage): void {
    console.log(`\n🏆 Player ${message.winner} wins!`);

    if (message.winningLine && message.winningLine.length > 0) {
      console.log('Winning line:', message.winningLine.join(' -> '));
    }

    console.log('\n🎮 Game Over!');
    console.log('1. Play again');
    console.log('2. Exit');

    this.rl.question('> ', (choice) => {
      if (choice.trim() === '1') {
        this.gameId = null;
        this.mySymbol = null;
        this.opponentSymbol = null;
        this.initializeBoard();
        this.showMainMenu();
      } else {
        this.handleExit();
      }
    });
  }

  /**
   * Handle draw message
   */
  private handleDraw(message: DrawMessage): void {
    console.log('\n🤝 It\'s a draw!');
    console.log('\n🎮 Game Over!');
    console.log('1. Play again');
    console.log('2. Exit');

    this.rl.question('> ', (choice) => {
      if (choice.trim() === '1') {
        this.gameId = null;
        this.mySymbol = null;
        this.opponentSymbol = null;
        this.initializeBoard();
        this.showMainMenu();
      } else {
        this.handleExit();
      }
    });
  }

  /**
   * Handle game cancelled (opponent disconnected)
   */
  private handleCancelled(message: GameCancelledMessage): void {
    console.log(`\n⚠️  Game cancelled: ${message.reason}`);
    this.resetGame();
    this.showMainMenu();
  }

  /**
   * Handle error message
   */
  private handleError(message: ErrorMessage): void {
    console.log(`❌ Error: ${message.message}`);

    // Check if it's a "Game not found" error when trying to join a game
    if (message.message.includes(ERROR_MESSAGES.GAME_NOT_FOUND) && !this.gameId) {
      console.log('\n💡 No available games found on this server.');
      console.log('This could happen if all games are full.');
      console.log('Try restarting the client to be reconnected to a different server.');
      console.log('Or press Ctrl+C to exit and try again later.\n');

      // Return to main menu on game discovery errors
      setTimeout(() => {
        this.showMainMenu();
      }, 3000);
    } else if (message.message.toLowerCase().includes('invalid move')) {
      // Invalid move - keep the player in the game and prompt for another move
      console.log(' Please try again.');

      // If we're in a game and it's our turn, prompt for another move
      if (this.gameId && this.nextTurn === this.mySymbol && Object.keys(this.currentPlayers).length === 2) {
        console.log(` It's still your turn! (${this.mySymbol})`);
        this.displayBoard();
        this.makeMove();
      }
    } else {
      // Other errors - return to main menu
      setTimeout(() => {
        this.showMainMenu();
      }, 3000);
    }
  }

  /**
   * Handle redirect message using proper typed message
   */
  private handleRedirect(data: RedirectMessage): void {
    console.log(`\n ${data.message}`);
    console.log(`Connecting to ${data.serverId} (port ${data.port}) for game ${data.gameId}...`);

    // Close current connection
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.isRedirecting = true;
      this.pendingGameToJoin = data.gameId;
      this.ws.close();
    }

    // Reconnect to the remote server with the specific game ID
    this.serverUrl = `ws://localhost:${data.port}`;
    this.tryConnectToServer(data.gameId).finally(() => {
      // Clear redirect state regardless of success
      this.isRedirecting = false;
    });
  }

  /**
   * Attempt to connect to server with optional game ID
   */
  private async tryConnectToServer(specificGameId?: string): Promise<void> {
    try {
      await this.connect();
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // If we have a specific game ID, join it automatically
        if (specificGameId) {
          console.log(`Auto-joining game ${specificGameId}...`);
          setTimeout(() => {
            this.joinGame(specificGameId);
            this.pendingGameToJoin = null;
          }, 500);
        }
      }
    } catch (error) {
      console.error('Failed to reconnect:', error);
      // Go back to main menu if reconnection fails
      setTimeout(() => {
        this.showMainMenu();
      }, 2000);
    }
  }

  /**
   * Join a specific game by ID
   */
  private joinGame(gameId: string): void {
    const joinMessage = new JoinMessage(gameId, this.playerId);
    this.sendMessage(joinMessage);
  }

  /**
   * Make a move
   */
  private makeMove(): void {
    console.log(`\n🎯 Your turn! (${this.mySymbol})`);
    console.log('Enter your move (row,col) or "quit" to leave:');

    this.rl.question('> ', (input) => {
      if (input.toLowerCase() === 'quit') {
        this.leaveGame();
        return;
      }

      // Parse input (format: "row,col" like "1,2")
      const parts = input.split(',');
      if (parts.length !== 2) {
        console.log('❌ Invalid format. Use format: row,col (e.g., 1,2)');
        this.makeMove();
        return;
      }

      const row = parseInt(parts[0].trim());
      const col = parseInt(parts[1].trim());

      if (isNaN(row) || isNaN(col) || row < 0 || row > 2 || col < 0 || col > 2) {
        console.log('❌ Invalid coordinates. Row and column must be 0-2.');
        this.makeMove();
        return;
      }

      // Send move
      const moveMessage = new MoveMessage(row, col, this.playerId, this.gameId || undefined);
      this.sendMessage(moveMessage);
    });
  }

  /**
   * Leave the current game
   */
  private leaveGame(): void {
    if (this.gameId) {
      const leaveMessage = new LeaveMessage(this.playerId, this.gameId);
      this.sendMessage(leaveMessage);

      this.gameId = null;
      this.mySymbol = null;
      this.opponentSymbol = null;
      this.initializeBoard();

      console.log('👋 Left the game.');
      this.showMainMenu();
    }
  }

  /**
   * Reset game state for new game
   */
  private resetGame(): void {
    this.gameId = null;
    this.mySymbol = null;
    this.opponentSymbol = null;
    this.nextTurn = null;
    this.currentPlayers = {};
    this.initializeBoard();
  }

  /**
   * Display the current board state
   */
  private displayBoard(): void {
    console.log('\n📋 Current Board:');
    console.log('   0   1   2');

    for (let row = 0; row < 3; row++) {
      let rowStr = `${row} `;

      for (let col = 0; col < 3; col++) {
        const symbol = this.board[row][col];
        rowStr += ` ${symbol || ' '} `;

        if (col < 2) rowStr += '|';
      }

      console.log(rowStr);

      if (row < 2) {
        console.log('  -----------');
      }
    }

    console.log('');
  }

  /**
   * Send message to server
   */
  private sendMessage(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Failed to send message:', error);
      }
    } else {
      console.error('Not connected to server');
    }
  }

  /**
   * Initialize empty board
   */
  private initializeBoard(): void {
    this.board = [
      [null, null, null],
      [null, null, null],
      [null, null, null]
    ];
  }

  /**
   * Generate unique player ID
   */
  private generatePlayerId(): string {
    return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Handle application exit
   */
  private handleExit(): void {
    console.log('\n👋 Goodbye!');

    if (this.gameId && this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Send leave message if we're in a game
      const leaveMessage = new LeaveMessage(this.playerId, this.gameId);
      this.sendMessage(leaveMessage);
    }

    if (this.ws) {
      this.ws.close();
    }

    this.rl.close();
    process.exit(0);
  }

  /**
   * Get current client status
   */
  getStatus(): {
    connected: boolean;
    serverUrl: string;
    playerId: string;
    gameId: string | null;
    mySymbol: PlayerSymbol | null;
    inGame: boolean;
  } {
    return {
      connected: this.isConnected,
      serverUrl: this.serverUrl,
      playerId: this.playerId,
      gameId: this.gameId,
      mySymbol: this.mySymbol,
      inGame: this.gameId !== null
    };
  }
}
