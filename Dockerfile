# Use Node.js 16 LTS version
FROM node:16-alpine AS base

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Production stage
FROM node:16-alpine AS production

# Set working directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S tictoe -u 1001

# Copy dependencies
COPY --from=base /app/node_modules ./node_modules

# Copy application code
COPY . .

# Change ownership and switch to non-root user
RUN chown -R tictoe:nodejs /app
USER tictoe

# Expose ports (can be overridden at runtime)
EXPOSE 3001-3050

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http=require('http');http.get('http://localhost:8080/health',res=>{process.exit(res.statusCode===200?0:1)}).on('error',()=>process.exit(1))" || exit 1

# Default command
CMD ["npm", "run", "server", "3001"]
