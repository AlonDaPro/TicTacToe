#!/usr/bin/env node

import "reflect-metadata";
import { GameServer } from './GameServer';
import { TicTacToeService } from '../services/TicTacToeService';
import { WebSocketFederationService } from '../services/WebSocketFederationService';
import { LoadBalancerService } from '../services/LoadBalancerService';
import { SERVER_CONSTANTS } from '../utils/constants';

/**
 * Unified Game Server - Can be A or B or more
 * Designed to scale to 50+ servers
 */
async function startServer() {
  const portArg = process.argv[2];
  let port: number;
  let serverId: string;
  let federationPorts: number[] = [];

  if (portArg) {
    port = parseInt(portArg);
    serverId = `Server${port - SERVER_CONSTANTS.FEDERATION_PORT_OFFSET}`; // ServerA = port 3001, ServerB = port 3002, etc.
  } else {
    // Default server configuration
    port = SERVER_CONSTANTS.SERVER_A_PORT;
    serverId = SERVER_CONSTANTS.SERVER_A_ID;
  }

  // Initialize services
  const gameService = new TicTacToeService();
  const gameServer = new GameServer(port, serverId, gameService);

  // Initialize federation for cross-server communication
  // Determine federation ports from ENV or CLI
  const envServers = process.env.SERVERS;
  if (envServers) {
    federationPorts = envServers
      .split(',')
      .map(s => parseInt(s.trim()))
      .filter(n => Number.isFinite(n));
  }
  const cliServersArg = process.argv[3];
  if (!federationPorts.length && cliServersArg) {
    federationPorts = cliServersArg
      .split(',')
      .map(s => parseInt(s.trim()))
      .filter(n => Number.isFinite(n));
  }
  if (!federationPorts.length) {
    federationPorts = [SERVER_CONSTANTS.SERVER_A_PORT, SERVER_CONSTANTS.SERVER_B_PORT];
  }
  const federationService = new WebSocketFederationService(gameService, serverId, port);
  await federationService.connectToServers(federationPorts);

  // Link federation to game server
  gameServer.setFederationService(federationService);

  console.log(`🎮 Tic-Tac-Toe Server ${serverId} running on port ${port}`);
  console.log(`🔗 Federation: ${federationService.isFederationActive() ? 'Active' : 'Inactive'}`);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log(`\n🛑 Shutting down Server ${serverId}...`);
    await federationService.disconnect();
    await gameServer.close();
    process.exit(0);
  });

  // Periodic cleanup and stats
  setInterval(() => {
    const cleaned = gameService.cleanupFinishedGames();
    if (cleaned > 0) {
      console.log(`Server ${serverId}: Cleaned up ${cleaned} finished games`);
    }

    // Log server stats periodically
    const stats = gameServer.getStats();
    const federationStats = federationService.getFederationStats();
    console.log(`Server ${serverId}: Stats - Clients: ${stats.connectedClients}, Games: ${stats.activeGames}, Federation: ${federationStats.isFederated ? '✅' : '❌'}`);
  }, 60 * 1000); // Every minute
}

startServer().catch(console.error);
