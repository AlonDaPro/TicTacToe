# 🎮 Real-Time Multiplayer Tic-Tac-Toe

A scalable multiplayer Tic-Tac-Toe game with intelligent cross-server federation and load balancing. Supports NxN boards, Docker deployment, and 50+ server scaling.

## 🏗️ Architecture

### System Overview
```
Federated Servers (50+ supported)
├─ Server A (Port 3001) ←→ Server B (Port 3002) ←→ Server N
├─ WebSocket Federation (Inter-server communication)
├─ Intelligent Load Balancer
■─── Auto Client Distribution
     ├─ Prioritizes servers with available games
     └─ Falls back to client count balancing

┌─────────────────────┐
│    CLI CLIENTS      │
│                     │
│ • Load balanced     │
│ • Auto-reconnects   │
│ • Cross-server play │
│ • Error tolerant    │
└─────────────────────┘
```

### Components
- **TicTacToeService**: Game logic, multiple board sizes, k-in-a-row wins
- **WebSocketFederationService**: Direct inter-server communication
- **LoadBalancerService**: Intelligent client distribution across servers
- **Docker**: Containerized deployment with orchestration

### Scaling
```bash
# Add any number of servers
npm run server 3001  # Server A
npm run server 3002  # Server B
npm run server 3003  # Server C
# ... npm run server PORTNUM for 50+ servers
```

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- Docker & Docker Compose (optional)

### Local Development Setup

1. **Install & Build:**
   ```bash
   npm install
   npm run build
   ```

2. **Start Servers:**
   ```bash
   # Terminal 1: Server A
   npm run server 3001

   # Terminal 2: Server B
   npm run server 3002
   ```

3. **Start Playing:**
   ```bash
   # Terminal 3+
   npm run client  # Auto-load balanced
   npm run client  # Second client
   ```

### Docker Deployment

```bash
# Start 2 servers
docker-compose up

# Start 4 servers (with scale profiles)
docker-compose --profile extra-servers up
```

## 🎯 How It Works

### Intelligent Load Balancing
- Clients automatically connect to least-loaded server
- Prefers servers with available games waiting for players
- Seamless cross-server game matching
- Federation allows players on different servers to play together

### Cross-Server Gameplay
1. **Player A** joins Server A → creates waiting game
2. **Player B** joins Server B → load balancer finds available game on Server A
3. **Auto-redirect** connects Player B to Server A seamlessly
4. **Federation** syncs game state between players on different servers

### Game Features
- **NxN boards**: `5x5`, `10x10`, etc. (default `3x3`)
- **K-in-a-row wins**: Configure winning length (default 3)
- **Real-time updates**: Instant board synchronization
- **Error tolerant**: Invalid moves don't disconnect players
- **CLI interface**: Works everywhere, no browser required

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Test Coverage
- ✅ Unit tests for services and models
- ✅ NxN board win detection (tested 4-in-a-row on 5x5)
- ✅ Federation communication
- ✅ Load balancer distribution

## 🎮 Gameplay

```
🎮 Tic-Tac-Toe Game Client
Choose an option:
1. Join a new game
2. Join specific game (enter game ID)
3. Exit

> 1
♻️ Connecting you to server Server1 where your game is waiting
🎉 Game started! You are player X

📋 Current Board:
   0   1   2
0  ·   ·   ·
  -----------
1  ·   X   ·
  -----------
2  ·   ·   ·

🎯 Your turn! (X)
Enter your move (row,col) or "quit" to leave:
> 0,0

⏳ Waiting for player O to make a move...
```

## 🛠️ Configuration

### Custom Game Rules
Edit `src/utils/constants.ts`:
```typescript
GAME_CONSTANTS = {
  BOARD_SIZE: 5,        // 5x5 board
  WINNING_LENGTH: 4,    // 4-in-a-row
}
```

### Server Ports
- Federation starts at port `3000`
- Server A: `3001`, Server B: `3002`, etc.
- Status endpoints: `ws://localhost:PORT/status`
- Federation: `ws://localhost:PORT/federation`

## 📊 Monitoring

Each server exposes real-time statistics at `ws://localhost:PORT/status`:
```json
{
  "serverId": "Server1",
  "port": 3001,
  "connectedClients": 2,
  "activeGames": 1,
  "availableGames": 0,
  "isFederated": true,
  "peers": ["Server2"]
}
```

## 🚨 Troubleshooting

### Servers Not Connecting
```bash
# Check if servers are federated
# Should see: "Federation established with X peers"

# Port conflicts?
netstat -ano | findstr :300

# Clear and restart
docker-compose down
docker-compose up
```

### Clients Not Distributing
```bash
# Check load balancer with debug
DEBUG=loadBalancer npm run client

# Manual server selection
npm run client -- --server 3001
```

### Federation Issues
```bash
# Verify federation connectivity
telnet localhost 3002

# Check federation logs
# Should see: "Federation active with X peers"
```

---

**🎮 Ready to scale? Your Tic-Tac-Toe federation supports limitless horizontal scaling!**
