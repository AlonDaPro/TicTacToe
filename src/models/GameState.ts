import { IsEnum, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PlayerSymbol, GameStatus, GameResult } from './MessageTypes';
import { Player } from './Player';
import { WinCheckResult } from '../types/GameTypes';

/**
 * Represents the state of a Tic-Tac-Toe game
 */
export class GameState {
  @IsString()
  id: string;

  @IsObject()
  board: (PlayerSymbol | null)[][];

  @Type(() => Number)
  boardSize: number = 3;

  @IsEnum(GameStatus)
  status: GameStatus;

  @ValidateNested({ each: true })
  @Type(() => Player)
  players: Player[];

  @IsOptional()
  @IsEnum(PlayerSymbol)
  winner?: PlayerSymbol;

  @IsOptional()
  @IsEnum(PlayerSymbol)
  nextTurn?: PlayerSymbol;

  @IsEnum(GameResult)
  result: GameResult;

  @IsOptional()
  @Type(() => Date)
  createdAt?: Date;

  @IsOptional()
  @Type(() => Date)
  updatedAt?: Date;

  @IsOptional()
  @Type(() => Number)
  winningLine?: number[];

  constructor(id: string, boardSize: number = 3, winningLength: number = boardSize) {
    this.id = id;
    this.boardSize = boardSize;
    // Initialize empty NxN board
    this.board = Array.from({ length: boardSize }, () => Array.from({ length: boardSize }, () => null));
    this.status = GameStatus.WAITING;
    this.players = [];
    this.result = GameResult.ONGOING;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this._winningLength = winningLength;
  }

  private _winningLength: number = 3;
  get winningLength(): number { return this._winningLength; }
  set winningLength(value: number) { this._winningLength = Math.max(3, Math.min(this.boardSize, value)); }

  /**
   * Check if the game is full (has 2 players)
   */
  public isFull(): boolean {
    return this.players.length === 2;
  }

  /**
   * Check if a player is in the game
   */
  public hasPlayer(playerId: string): boolean {
    return this.players.some(player => player.id === playerId);
  }

  /**
   * Get player by ID
   */
  public getPlayer(playerId: string): Player | undefined {
    return this.players.find(player => player.id === playerId);
  }

  /**
   * Get opponent of a player
   */
  public getOpponent(playerId: string): Player | undefined {
    return this.players.find(player => player.id !== playerId);
  }

  /**
   * Add a player to the game
   */
  public addPlayer(player: Player): boolean {
    if (this.isFull()) {
      return false;
    }

    // Check if player is already in the game
    if (this.hasPlayer(player.id)) {
      return false;
    }

    // Assign symbol based on current players
    const existingSymbols = this.players.map(p => p.symbol);
    if (!existingSymbols.includes(PlayerSymbol.X)) {
      player.symbol = PlayerSymbol.X;
    } else if (!existingSymbols.includes(PlayerSymbol.O)) {
      player.symbol = PlayerSymbol.O;
    }

    this.players.push(player);
    this.updatedAt = new Date();

    // Start game if we now have 2 players
    if (this.isFull()) {
      this.status = GameStatus.PLAYING;
      this.nextTurn = PlayerSymbol.X;
    }

    return true;
  }

  /**
   * Remove a player from the game
   */
  public removePlayer(playerId: string): boolean {
    const initialLength = this.players.length;
    this.players = this.players.filter(player => player.id !== playerId);
    this.updatedAt = new Date();
    return this.players.length < initialLength;
  }

  /**
   * Make a move on the board
   */
  public makeMove(playerId: string, row: number, col: number): boolean {
    // Validate game state
    if (this.status !== GameStatus.PLAYING || this.result !== GameResult.ONGOING) {
      return false;
    }

    const player = this.getPlayer(playerId);
    if (!player) {
      return false;
    }

    // Check if it's the player's turn
    if (this.nextTurn !== player.symbol) {
      return false;
    }

    // Check if position is valid and empty
    if (row < 0 || row >= this.boardSize || col < 0 || col >= this.boardSize || this.board[row][col] !== null) {
      return false;
    }

    // Make the move
    this.board[row][col] = player.symbol;
    this.updatedAt = new Date();

    // Switch turns
    this.nextTurn = this.nextTurn === PlayerSymbol.X ? PlayerSymbol.O : PlayerSymbol.X;

    // Check for win or draw
    const winResult = this.checkWinWithLastMove(row, col);
    if (winResult.hasWinner) {
      this.status = GameStatus.FINISHED;
      this.result = GameResult.WIN;
      this.winner = winResult.winner!;
      this.winningLine = winResult.winningLine;
    } else if (this.isBoardFull()) {
      this.status = GameStatus.FINISHED;
      this.result = GameResult.DRAW;
    }

    return true;
  }

  /**
   * Check if the board is full
   */
  private isBoardFull(): boolean {
    for (let row = 0; row < this.boardSize; row++) {
      for (let col = 0; col < this.boardSize; col++) {
        if (this.board[row][col] === null) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Check for win condition using the last move position
   * Supports k-in-a-row detection on NxN boards
   */
  private checkWinWithLastMove(row: number, col: number): WinCheckResult {
    const symbol = this.board[row][col];
    if (!symbol) return { hasWinner: false };

    const n = this.boardSize;
    const k = this.winningLength;

    const checkDirection = (deltaRow: number, deltaCol: number): number[] | null => {
      let positions: number[] = [row * n + col]; // Include the current position

      // Count pieces in positive direction (+delta)
      let currentRow = row + deltaRow;
      let currentCol = col + deltaCol;
      while (currentRow >= 0 && currentRow < n && currentCol >= 0 && currentCol < n && this.board[currentRow][currentCol] === symbol) {
        positions.push(currentRow * n + currentCol);
        currentRow += deltaRow;
        currentCol += deltaCol;
      }

      // Count pieces in negative direction (-delta)
      currentRow = row - deltaRow;
      currentCol = col - deltaCol;
      while (currentRow >= 0 && currentRow < n && currentCol >= 0 && currentCol < n && this.board[currentRow][currentCol] === symbol) {
        positions.unshift(currentRow * n + currentCol);
        currentRow -= deltaRow;
        currentCol -= deltaCol;
      }

      return positions.length >= k ? positions : null;
    };

    // Check all 4 directions
    const directions = [
      { deltaRow: 0, deltaCol: 1 },   // horizontal
      { deltaRow: 1, deltaCol: 0 },   // vertical
      { deltaRow: 1, deltaCol: 1 },   // diagonal \
      { deltaRow: 1, deltaCol: -1 },  // diagonal /
    ];

    for (const { deltaRow, deltaCol } of directions) {
      const winningLine = checkDirection(deltaRow, deltaCol);
      if (winningLine) {
        return { hasWinner: true, winner: symbol, winningLine: winningLine.sort((a, b) => a - b) };
      }
    }

    return { hasWinner: false };
  }

  /**
   * Get the current game state summary for broadcasting
   */
  public getStateSummary(): {
    board: (PlayerSymbol | null)[][];
    nextTurn: PlayerSymbol;
    winner?: PlayerSymbol;
    players: { [key: string]: PlayerSymbol };
    status: GameStatus;
    result: GameResult;
    winningLine?: number[];
  } {
    const players: { [key: string]: PlayerSymbol } = {};
    this.players.forEach(player => {
      players[player.id] = player.symbol;
    });

    return {
      board: this.board,
      nextTurn: this.nextTurn || PlayerSymbol.X,
      winner: this.winner,
      players,
      status: this.status,
      result: this.result,
      winningLine: this.winningLine
    };
  }
}
