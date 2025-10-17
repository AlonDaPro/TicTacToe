import { v4 as uuidv4 } from 'uuid';
import { GameState } from '../models/GameState';
import { Player } from '../models/Player';
import { PlayerSymbol, GameStatus, GameResult } from '../models/MessageTypes';

/**
 * Service for managing Tic-Tac-Toe games
 */
export class TicTacToeService {
    private games: Map<string, GameState> = new Map();
    private playerToGame: Map<string, string> = new Map(); // playerId -> gameId

    /**
     * Create a new game
     */
    public createGame(boardSize: number = 3, winningLength: number = boardSize): GameState {
        const gameId = uuidv4();
        const game = new GameState(gameId, boardSize, winningLength);
        this.games.set(gameId, game);
        return game;
    }

    /**
     * Get all active games
     */
    public getActiveGames(): GameState[] {
        return Array.from(this.games.values()).filter(game => game.status === GameStatus.WAITING || game.status === GameStatus.PLAYING);
    }

    /**
     * Get game by ID
     */
    public getGame(gameId: string): GameState | undefined {
        return this.games.get(gameId);
    }

    /**
     * Add player to a game
     */
    public addPlayerToGame(gameId: string, playerId: string, playerSymbol?: PlayerSymbol, serverId?: string): {
        success: boolean;
        game?: GameState;
        error?: string;
    } {
        const game = this.getGame(gameId);
        if (!game) {
            return { success: false, error: 'Game not found' };
        }

        if (game.status === GameStatus.FINISHED) {
            return { success: false, error: 'Game is already finished' };
        }

        // Allow re-joining or moving players if their previous game is finished or empty
        if (this.playerToGame.has(playerId)) {
            const existingGameId = this.playerToGame.get(playerId)!;
            if (existingGameId !== gameId) {
                const existing = this.getGame(existingGameId);
                const canRelease = !existing || existing.status === GameStatus.FINISHED || existing.players.length === 0;
                if (!canRelease) {
                    return { success: false, error: 'Player is already in another game' };
                }
                // Release mapping if safe
                this.playerToGame.delete(playerId);
            } else {
                // Re-joining same game is fine
                return { success: true, game };
            }
        }

        // Create player
        const player = new Player(playerId, playerSymbol || PlayerSymbol.X, `Player ${playerId}`);
        player.setServer(serverId || 'unknown');

        // Add player to game
        if (!game.addPlayer(player)) {
            return { success: false, error: 'Unable to add player to game' };
        }

        // Map player to game
        this.playerToGame.set(playerId, gameId);

        return { success: true, game };
    }

    /**
     * Make a move in a game
     */
    public makeMove(gameId: string, playerId: string, row: number, col: number): {
        success: boolean;
        game?: GameState;
        error?: string;
        isGameFinished?: boolean;
    } {
        const game = this.getGame(gameId);
        if (!game) {
            return { success: false, error: 'Game not found' };
        }

        // Make the move
        if (!game.makeMove(playerId, row, col)) {
            return { success: false, error: 'Invalid move' };
        }

        const isGameFinished = game.status === GameStatus.FINISHED;

        return {
            success: true,
            game,
            isGameFinished
        };
    }

    /**
     * Remove player from game
     */
    public removePlayerFromGame(playerId: string): GameState | null {
        const gameId = this.playerToGame.get(playerId);
        if (!gameId) {
            return null;
        }

        const game = this.getGame(gameId);
        if (!game) {
            return null;
        }

        game.removePlayer(playerId);
        this.playerToGame.delete(playerId);

        return game;
    }

    /**
     * Find an available game or create a new one for a player wanting to play again
     */
    public findOrCreateGameForPlayer(playerId: string, boardSize: number = 3, winningLength: number = boardSize): GameState {
        // Try to find game with exactly 1 player
        const available = Array.from(this.games.values()).find(g => g.status === GameStatus.WAITING && g.players.length === 1 && g.boardSize === boardSize && g.winningLength === winningLength);
        if (available) return available;
        // Otherwise create new
        return this.createGame(boardSize, winningLength);
    }

    /**
     * Get all games for a server (used for federation)
     */
    public getGamesForServer(serverId: string): GameState[] {
        return Array.from(this.games.values()).filter(game =>
            game.players.some(player => player.isOnServer(serverId))
        );
    }

    /**
     * Sync game state from another server
     */
    public syncGameState(serverId: string, gameState: any): boolean {
        try {
            // For now, we'll trust the server sending the sync
            // In production, you'd want more validation
            const game = this.getGame(gameState.id);

            if (!game) {
                // Create the game if it doesn't exist
                const newGame = new GameState(gameState.id);
                // Apply state updates would go here
                this.games.set(gameState.id, newGame);
            }

            // Update game state
            // This would be more complex in real implementation
            // For now, this sync method exists for federation architecture

            return true;
        } catch (error) {
            console.error('Error syncing game state:', error);
            return false;
        }
    }

    /**
     * Clean up finished games (called periodically)
     */
    public cleanupFinishedGames(olderThanMinutes: number = 30): number {
        const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000);
        let cleanedCount = 0;

        for (const [gameId, game] of this.games.entries()) {
            if (game.status === GameStatus.FINISHED && game.updatedAt && game.updatedAt < cutoffTime) {
                this.games.delete(gameId);

                // Clean up player mappings
                game.players.forEach(player => {
                    this.playerToGame.delete(player.id);
                });

                cleanedCount++;
            }
        }

        return cleanedCount;
    }

    /**
     * Get game statistics
     */
    public getStats(): {
        totalGames: number;
        activeGames: number;
        finishedGames: number;
        playersOnline: number;
    } {
        const allGames = Array.from(this.games.values());
        const activeGames = allGames.filter(game => game.status === GameStatus.WAITING || game.status === GameStatus.PLAYING);
        const finishedGames = allGames.filter(game => game.status === GameStatus.FINISHED);

        return {
            totalGames: allGames.length,
            activeGames: activeGames.length,
            finishedGames: finishedGames.length,
            playersOnline: this.playerToGame.size
        };
    }
}
