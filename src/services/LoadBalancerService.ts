import WebSocket from 'ws';
import { SERVER_CONSTANTS, URL_CONSTANTS, NETWORK_CONSTANTS, ServerStats } from '../utils/constants';

/**
 * Load balancer service for distributing clients across multiple servers
 * Designed to scale to 50+ servers
 */
export class LoadBalancerService {
  private serverRegistry = new Map<string, ServerStats>(); // serverId -> stats
  private serverUrls: string[] = [];
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(serverPorts: number[] = [SERVER_CONSTANTS.SERVER_A_PORT, SERVER_CONSTANTS.SERVER_B_PORT]) {
    this.serverUrls = serverPorts.map(port => `ws://localhost:${port}`);
    this.startHealthChecks();
  }

  /**
   * Start periodic health checks for all servers
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.updateServerStats();
    }, NETWORK_CONSTANTS.STATUS_POLL_TIMEOUT);

    // Initial health check
    this.updateServerStats().catch(console.error);
  }

  /**
   * Update statistics for all servers
   */
  private async updateServerStats(): Promise<void> {
    const updatePromises = this.serverUrls.map(async (serverUrl) => {
      try {
        const stats = await this.getServerStats(serverUrl);
        if (stats) {
          this.serverRegistry.set(stats.serverId, stats);
        } else {
          console.warn(`LoadBalancer: No stats from ${serverUrl}`);
        }
      } catch (error) {
        console.warn(`LoadBalancer: Failed to get stats from ${serverUrl}:`, error);
      }
    });

    await Promise.allSettled(updatePromises);

  }

  /**
   * Get statistics from a specific server
   */
  private async getServerStats(serverUrl: string): Promise<ServerStats | null> {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(serverUrl + URL_CONSTANTS.STATUS_ENDPOINT);

        ws.on('open', () => {
          // Connection successful
        });

        ws.on('message', (data: WebSocket.RawData) => {
          try {
            const stats = JSON.parse(data.toString()) as ServerStats;
            resolve(stats);
            ws.close();
          } catch (error) {
            console.error('LoadBalancer: Failed to parse server stats:', error);
            resolve(null);
            ws.close();
          }
        });

        ws.on('error', () => {
          resolve(null);
        });

        // Timeout
        setTimeout(() => {
          resolve(null);
          ws.close();
        }, NETWORK_CONSTANTS.STATUS_POLL_TIMEOUT);

      } catch (error) {
        resolve(null);
      }
    });
  }

  /**
   * Choose the best server for a new client connection
   * Prioritizes servers with fewer connected clients
   */
  async chooseOptimalServer(): Promise<string> {
    let availableServers: ServerStats[] = [];

    // Retry up to 5 times to find available servers
    for (let attempt = 0; attempt < 5; attempt++) {
      // Ensure we have up-to-date server information
      await this.updateServerStats();

      // Get all responding servers
      availableServers = Array.from(this.serverRegistry.values());

      if (availableServers.length > 0) {
        break; // Found servers, proceed
      }

      // Wait a bit before retrying
      if (attempt < 4) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (availableServers.length === 0) {
      // Fallback: Try each server in sequence until one responds
      for (const url of this.serverUrls) {
        try {
          const stats = await this.getServerStats(url);
          if (stats) {
            console.log(`LoadBalancer: Found available server at ${url}`);
            return url;
          }
        } catch (error) {
          console.warn(`LoadBalancer: Server at ${url} not available:`, error);
        }
      }

      // If no servers are available at all, fallback to localhost:3001
      console.log('LoadBalancer: No servers available, using fallback');
      return this.serverUrls[0];
    }

    if (availableServers.length === 1) {
      console.log(`LoadBalancer: Found 1 server (${availableServers[0].serverId}) with ${availableServers[0].connectedClients} clients`);
      return `ws://localhost:${availableServers[0].port}`;
    }

    // Priority: Server with the fewest connected clients
    return this.selectLeastLoadedServer(availableServers);
  }

  /**
   * Select the server with the fewest connected clients
   */
  private selectLeastLoadedServer(servers: ServerStats[]): string {
    let leastLoaded = servers[0];

    for (let i = 1; i < servers.length; i++) {
      if (servers[i].connectedClients < leastLoaded.connectedClients) {
        leastLoaded = servers[i];
      }
    }

    return `ws://localhost:${leastLoaded.port}`;
  }

  /**
   * Select the best server based on criteria
   */
  private selectBestServer(servers: ServerStats[], primaryMetric: keyof ServerStats, secondaryMetric?: keyof ServerStats): string {
    let bestServer = servers[0];
    let bestScore = this.getServerScore(bestServer, primaryMetric, secondaryMetric);

    for (let i = 1; i < servers.length; i++) {
      const server = servers[i];
      const score = this.getServerScore(server, primaryMetric, secondaryMetric);

      if (score < bestScore) {
        bestServer = server;
        bestScore = score;
      }
    }

    return `ws://localhost:${bestServer.port}`;
  }

  /**
   * Calculate server score for selection (lower is better)
   */
  private getServerScore(server: ServerStats, primaryMetric: keyof ServerStats, secondaryMetric?: keyof ServerStats): number {
    let score = 0;

    // Primary metric (inverted for "lower is better")
    if (primaryMetric === 'availableGames') {
      score = 1000 - (server.availableGames * 100); // Prefer more available games
    } else {
      score = server[primaryMetric] as number;
    }

    // Secondary metric (tie-breaker)
    if (secondaryMetric) {
      score += (server[secondaryMetric] as number) * 0.1;
    }

    return score;
  }

  /**
   * Get all available servers for game discovery
   */
  async getServersWithAvailableGames(): Promise<ServerStats[]> {
    await this.updateServerStats();
    return Array.from(this.serverRegistry.values())
      .filter(server => server.availableGames > 0);
  }

  /**
   * Register a new server in the load balancer
   */
  registerServer(serverId: string, port: number): void {
    const serverUrl = `ws://localhost:${port}`;
    if (!this.serverUrls.includes(serverUrl)) {
      this.serverUrls.push(serverUrl);
      console.log(`LoadBalancer: Registered new server ${serverId} on port ${port}`);
    }
  }

  /**
   * Remove a server from the load balancer
   */
  unregisterServer(serverId: string): void {
    this.serverRegistry.delete(serverId);
    console.log(`LoadBalancer: Unregistered server ${serverId}`);
  }

  /**
   * Get current load balancer statistics
   */
  getLoadBalancerStats(): {
    totalServers: number;
    activeServers: number;
    totalClients: number;
    totalGames: number;
    totalAvailableGames: number;
  } {
    const servers = Array.from(this.serverRegistry.values());

    return {
      totalServers: this.serverUrls.length,
      activeServers: servers.length,
      totalClients: servers.reduce((sum, server) => sum + server.connectedClients, 0),
      totalGames: servers.reduce((sum, server) => sum + server.activeGames, 0),
      totalAvailableGames: servers.reduce((sum, server) => sum + server.availableGames, 0),
    };
  }

  /**
   * Stop health checks and cleanup
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }
}
