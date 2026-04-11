# Use Node.js 20/22/24 slim for a smaller image
FROM node:22-slim

# Install system dependencies (FFmpeg is required for voice)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (only production)
RUN npm install --omit=dev

# Copy source code
COPY . .

# Ensure the recordings directory exists
RUN mkdir -p tmp-recordings

# Start the bot
CMD ["npm", "start"]
