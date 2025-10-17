import { PlayerSymbol } from '../models/MessageTypes';

export interface WinCheckResult {
  hasWinner: boolean;
  winner?: PlayerSymbol;
  winningLine?: number[];
}

export type Grid<T = PlayerSymbol | null> = (T | null)[][];

export interface Position {
  row: number;
  col: number;
}


