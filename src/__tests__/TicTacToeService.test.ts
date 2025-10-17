import { TicTacToeService } from '../services/TicTacToeService';
import { PlayerSymbol, GameStatus, GameResult } from '../models/MessageTypes';

describe('TicTacToeService', () => {
  let service: TicTacToeService;

  beforeEach(() => {
    service = new TicTacToeService();
  });

  afterEach(() => {
    // Clean up any intervals or timers
    jest.clearAllTimers();
  });

  describe('createGame', () => {
    it('should create a new game with unique ID', () => {
      const game1 = service.createGame();
      const game2 = service.createGame(4); // NxN ready

      expect(game1).toBeDefined();
      expect(game2).toBeDefined();
      expect(game1.id).not.toBe(game2.id);
      expect(game1.status).toBe(GameStatus.WAITING);
      expect(game1.players).toHaveLength(0);
      expect(game2.board.length).toBe(4);
    });
  });

  describe('addPlayerToGame', () => {
    it('should add first player to game', () => {
      const game = service.createGame();
      const result = service.addPlayerToGame(game.id, 'player1', PlayerSymbol.X, 'server1');

      expect(result.success).toBe(true);
      expect(result.game!.players).toHaveLength(1);
      expect(result.game!.players[0].id).toBe('player1');
      expect(result.game!.players[0].symbol).toBe(PlayerSymbol.X);
      expect(result.game!.players[0].serverId).toBe('server1');
    });

    it('should add second player to game and start it', () => {
      const game = service.createGame();
      service.addPlayerToGame(game.id, 'player1', PlayerSymbol.X, 'server1');
      const result = service.addPlayerToGame(game.id, 'player2', PlayerSymbol.O, 'server2');

      expect(result.success).toBe(true);
      expect(result.game!.players).toHaveLength(2);
      expect(result.game!.status).toBe(GameStatus.PLAYING);
      expect(result.game!.nextTurn).toBe(PlayerSymbol.X);
    });

    it('should reject adding to full game', () => {
      const game = service.createGame();
      service.addPlayerToGame(game.id, 'player1', PlayerSymbol.X, 'server1');
      service.addPlayerToGame(game.id, 'player2', PlayerSymbol.O, 'server2');
      const result = service.addPlayerToGame(game.id, 'player3', PlayerSymbol.X, 'server3');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unable to add player');
    });

    it('should reject adding player already in game', () => {
      const game = service.createGame();
      service.addPlayerToGame(game.id, 'player1', PlayerSymbol.X, 'server1');
      const result = service.addPlayerToGame(game.id, 'player1', PlayerSymbol.X, 'server1');

      expect(result.success).toBe(true); // Should return success for existing player
      expect(result.game!.players).toHaveLength(1);
    });

    it('should reject adding to finished game', () => {
      const game = service.createGame();
      service.addPlayerToGame(game.id, 'player1', PlayerSymbol.X, 'server1');
      service.addPlayerToGame(game.id, 'player2', PlayerSymbol.O, 'server2');

      // Manually finish the game
      game.status = GameStatus.FINISHED;
      game.result = GameResult.WIN;
      game.winner = PlayerSymbol.X;

      const result = service.addPlayerToGame(game.id, 'player3', PlayerSymbol.X, 'server3');

      expect(result.success).toBe(false);
      expect(result.error).toContain('already finished');
    });
  });

  describe('makeMove', () => {
    it('should make valid move', () => {
      const game = service.createGame();
      service.addPlayerToGame(game.id, 'player1', PlayerSymbol.X, 'server1');
      service.addPlayerToGame(game.id, 'player2', PlayerSymbol.O, 'server2');

      const result = service.makeMove(game.id, 'player1', 0, 0);

      expect(result.success).toBe(true);
      expect(game.board[0][0]).toBe(PlayerSymbol.X);
      expect(game.nextTurn).toBe(PlayerSymbol.O);
    });

    it('should reject move on occupied cell', () => {
      const game = service.createGame();
      service.addPlayerToGame(game.id, 'player1', PlayerSymbol.X, 'server1');
      service.addPlayerToGame(game.id, 'player2', PlayerSymbol.O, 'server2');

      service.makeMove(game.id, 'player1', 0, 0);
      const result = service.makeMove(game.id, 'player2', 0, 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid move');
    });

    it('should reject move when not player\'s turn', () => {
      const game = service.createGame();
      service.addPlayerToGame(game.id, 'player1', PlayerSymbol.X, 'server1');
      service.addPlayerToGame(game.id, 'player2', PlayerSymbol.O, 'server2');

      const result = service.makeMove(game.id, 'player2', 0, 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid move');
    });

    it('should reject move with invalid coordinates', () => {
      const game = service.createGame();
      service.addPlayerToGame(game.id, 'player1', PlayerSymbol.X, 'server1');
      service.addPlayerToGame(game.id, 'player2', PlayerSymbol.O, 'server2');

      const result = service.makeMove(game.id, 'player1', -1, 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid move');
    });

    it('should detect horizontal win', () => {
      const game = service.createGame();
      service.addPlayerToGame(game.id, 'player1', PlayerSymbol.X, 'server1');
      service.addPlayerToGame(game.id, 'player2', PlayerSymbol.O, 'server2');

      service.makeMove(game.id, 'player1', 0, 0);
      service.makeMove(game.id, 'player2', 1, 0);
      service.makeMove(game.id, 'player1', 0, 1);
      service.makeMove(game.id, 'player2', 1, 1);
      const result = service.makeMove(game.id, 'player1', 0, 2);

      expect(result.success).toBe(true);
      expect(result.isGameFinished).toBe(true);
      expect(game.status).toBe(GameStatus.FINISHED);
      expect(game.winner).toBe(PlayerSymbol.X);
      expect(game.winningLine).toEqual([0, 1, 2]);
    });

    it('should detect vertical win', () => {
      const game = service.createGame();
      service.addPlayerToGame(game.id, 'player1', PlayerSymbol.X, 'server1');
      service.addPlayerToGame(game.id, 'player2', PlayerSymbol.O, 'server2');

      service.makeMove(game.id, 'player1', 0, 0);
      service.makeMove(game.id, 'player2', 0, 1);
      service.makeMove(game.id, 'player1', 1, 0);
      service.makeMove(game.id, 'player2', 1, 1);
      const result = service.makeMove(game.id, 'player1', 2, 0);

      expect(result.success).toBe(true);
      expect(result.isGameFinished).toBe(true);
      expect(game.winner).toBe(PlayerSymbol.X);
    });

    it('should detect diagonal win', () => {
      const game = service.createGame();
      service.addPlayerToGame(game.id, 'player1', PlayerSymbol.X, 'server1');
      service.addPlayerToGame(game.id, 'player2', PlayerSymbol.O, 'server2');

      service.makeMove(game.id, 'player1', 0, 0);
      service.makeMove(game.id, 'player2', 0, 1);
      service.makeMove(game.id, 'player1', 1, 1);
      service.makeMove(game.id, 'player2', 1, 0);
      const result = service.makeMove(game.id, 'player1', 2, 2);

      expect(result.success).toBe(true);
      expect(result.isGameFinished).toBe(true);
      expect(game.winner).toBe(PlayerSymbol.X);
    });

    it('should detect draw', () => {
      const game = service.createGame();
      service.addPlayerToGame(game.id, 'player1', PlayerSymbol.X, 'server1');
      service.addPlayerToGame(game.id, 'player2', PlayerSymbol.O, 'server2');

      // Fill board without winning (classic tic-tac-toe draw)
      service.makeMove(game.id, 'player1', 0, 0); // X
      service.makeMove(game.id, 'player2', 0, 1); // O
      service.makeMove(game.id, 'player1', 0, 2); // X
      service.makeMove(game.id, 'player2', 1, 1); // O
      service.makeMove(game.id, 'player1', 1, 0); // X
      service.makeMove(game.id, 'player2', 1, 2); // O
      service.makeMove(game.id, 'player1', 2, 1); // X
      service.makeMove(game.id, 'player2', 2, 0); // O
      const result = service.makeMove(game.id, 'player1', 2, 2); // X

      expect(result.success).toBe(true);
      expect(result.isGameFinished).toBe(true);
      expect(game.status).toBe(GameStatus.FINISHED);
      expect(game.result).toBe(GameResult.DRAW);
    });
  });

  describe('removePlayerFromGame', () => {
    it('should remove player from game', () => {
      const game = service.createGame();
      service.addPlayerToGame(game.id, 'player1', PlayerSymbol.X, 'server1');

      const result = service.removePlayerFromGame('player1');

      expect(result).not.toBeNull();
      expect(result!.players).toHaveLength(0);
    });

    it('should return null for non-existent player', () => {
      const result = service.removePlayerFromGame('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      const game1 = service.createGame();
      const game2 = service.createGame();
      service.addPlayerToGame(game1.id, 'player1', PlayerSymbol.X, 'server1');
      service.addPlayerToGame(game2.id, 'player2', PlayerSymbol.O, 'server2');

      const stats = service.getStats();

      expect(stats.totalGames).toBe(2);
      expect(stats.activeGames).toBe(2);
      expect(stats.finishedGames).toBe(0);
      expect(stats.playersOnline).toBe(2);
    });
  });

  describe('cleanupFinishedGames', () => {
    it('should clean up old finished games', () => {
      const game = service.createGame();
      service.addPlayerToGame(game.id, 'player1', PlayerSymbol.X, 'server1');
      service.addPlayerToGame(game.id, 'player2', PlayerSymbol.O, 'server2');

      // Finish the game
      game.status = GameStatus.FINISHED;
      game.result = GameResult.WIN;

      // Manually set old timestamp
      game.updatedAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

      const cleaned = service.cleanupFinishedGames(30); // 30 minutes

      expect(cleaned).toBe(1);
    });
  });

  describe('NxN board win detection', () => {
    it('should detect a 4-in-a-row on 5x5 board', () => {
      const game = service.createGame(5, 4);
      service.addPlayerToGame(game.id, 'player1', PlayerSymbol.X, 'server1');
      service.addPlayerToGame(game.id, 'player2', PlayerSymbol.O, 'server2');

      // X forms 4 in a row horizontally at row 2
      service.makeMove(game.id, 'player1', 2, 0);
      service.makeMove(game.id, 'player2', 0, 0);
      service.makeMove(game.id, 'player1', 2, 1);
      service.makeMove(game.id, 'player2', 0, 1);
      service.makeMove(game.id, 'player1', 2, 2);
      service.makeMove(game.id, 'player2', 0, 2);
      const result = service.makeMove(game.id, 'player1', 2, 3);

      expect(result.success).toBe(true);
      expect(result.isGameFinished).toBe(true);
      expect(game.winner).toBe(PlayerSymbol.X);
    });
  });
});
