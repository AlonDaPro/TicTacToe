#!/usr/bin/env node

import "reflect-metadata";
import WebSocket from 'ws';
import { LoadBalancerService } from '../services/LoadBalancerService';
import { ERROR_MESSAGES, NETWORK_CONSTANTS, SERVER_CONSTANTS, URL_CONSTANTS } from '../utils/constants';
import { GameClient } from "./gameClient";

/**
 * Multi-server game client that can connect to different servers
 * and intelligently find available games across servers
 */
class MultiServerGameClient {
  private gameClient: GameClient | null = null;
  private loadBalancer: LoadBalancerService;

  constructor() {
    // Initialize load balancer with default server ports
    const portsFromEnv = process.env.SERVERS?.split(',')
      .map(s => parseInt(s.trim()))
      .filter(n => Number.isFinite(n));
    const ports = portsFromEnv && portsFromEnv.length > 0
      ? portsFromEnv
      : [SERVER_CONSTANTS.SERVER_A_PORT, SERVER_CONSTANTS.SERVER_B_PORT];
    this.loadBalancer = new LoadBalancerService(ports);
  }

  /**
   * Connect to a server with load balancing and multi-server support
   */
  async connect(): Promise<void> {
    // Always use load balancing to choose the best server
    const serverUrl = await this.loadBalancer.chooseOptimalServer();
    console.log(`🎯 Connecting to load-balanced server: ${serverUrl}`);
    this.gameClient = new GameClient(serverUrl);

    try {
      await this.gameClient.connect();
      // Store reference for potential server switching
      (global as any).currentGameClient = this;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get the load balancer instance for advanced operations
   */
  getLoadBalancer(): LoadBalancerService {
    return this.loadBalancer;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.loadBalancer.stop();
  }
}

/**
 * Main CLI entry point for the Tic-Tac-Toe client
 */
async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);

  // Check for help
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  // No manual server selection; the load balancer will choose the least loaded server

  try {
    console.log('🎮 Welcome to Real-Time Tic-Tac-Toe!');
    console.log('Press Ctrl+C to exit at any time.\n');

    const client = new MultiServerGameClient();
    await client.connect();

  } catch (error) {
    console.error('❌ Failed to start client:', error);
    console.log('\n💡 Make sure the game server is running on the specified port.');
    console.log('   Start servers using: npm run server:a & npm run server:b');
    process.exit(1);
  }
}



/**
 * Get server statistics for load balancing
 */
async function getServerStats(serverUrl: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(serverUrl.replace(/\/$/, '') + URL_CONSTANTS.STATUS_ENDPOINT);

    ws.on('open', () => {
      // Connection successful
    });

    ws.on('message', (data: WebSocket.RawData) => {
      try {
        const stats = JSON.parse(data.toString());
        resolve(stats);
        ws.close();
      } catch (error) {
        reject(error);
        ws.close();
      }
    });

    ws.on('error', reject);

    // Timeout after configured seconds
    setTimeout(() => {
      reject(new Error(ERROR_MESSAGES.CONNECTION_TIMEOUT));
      ws.close();
    }, NETWORK_CONSTANTS.STATUS_POLL_TIMEOUT);
  });
}

/**
 * Show help information
 */
function showHelp(): void {
  console.log(`
🎮 Real-Time Tic-Tac-Toe Client

USAGE:
  npm run client

OPTIONS:
  (none)               Client will auto-connect via load balancer

  --help, -h           Show this help message

EXAMPLES:
  npm run client                    # Auto-connect to least-loaded server

GAMEPLAY:
  - Join a new game or join by game ID
  - Make moves by entering coordinates (row,col)
  - Example: "1,2" for row 1, column 2
  - Type "quit" to leave the current game
  - Press Ctrl+C to exit

Start servers first:
  npm run server:a & npm run server:b
`);
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the main function
main().catch(console.error);
