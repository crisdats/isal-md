# Use Node.js LTS based on Debian Buster
FROM node:lts-buster

# Create and activate a swap file, update repositories, install dependencies, and clean cache
RUN dd if=/dev/zero of=/swapfilel bs=9999 count=999999 && \
    apt-get update -y && \
    apt-get install -y --no-install-recommends \
      ffmpeg \
      imagemagick \
      webp && \
    apt-get upgrade -y && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json for dependency installation
COPY package.json ./
COPY package-lock.json* ./

# Install Node.js dependencies
RUN npm install --production

# Copy all project files to the container
COPY . .

# Expose port 5000 for the application
EXPOSE 5000

# Copy the start script and make it executable
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Start the application using the start script
CMD ["/app/start.sh"]
