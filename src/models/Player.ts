import { IsEnum, IsString, IsOptional } from 'class-validator';
import { PlayerSymbol } from './MessageTypes';

/**
 * Represents a player in the game
 */
export class Player {
    @IsString()
    id: string;

    @IsOptional()
    @IsString()
    username?: string;

    @IsEnum(PlayerSymbol)
    symbol: PlayerSymbol;

    @IsOptional()
    @IsString()
    serverId?: string; // Which server the player is connected to

    @IsOptional()
    connectionTime?: Date;

    constructor(id: string, symbol: PlayerSymbol, username?: string) {
        this.id = id;
        this.symbol = symbol;
        this.username = username;
        this.connectionTime = new Date();
    }

    /**
     * Check if this player has a specific symbol
     */
    public hasSymbol(symbol: PlayerSymbol): boolean {
        return this.symbol === symbol;
    }

    /**
     * Update the player's server association
     */
    public setServer(serverId: string): void {
        this.serverId = serverId;
    }

    /**
     * Check if player is connected to a specific server
     */
    public isOnServer(serverId: string): boolean {
        return this.serverId === serverId;
    }
}
