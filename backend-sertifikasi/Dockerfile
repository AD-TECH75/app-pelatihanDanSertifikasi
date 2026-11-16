FROM node:22-slim
# Chromium + font untuk Puppeteer

RUN apt-get update && apt-get install -y chromium fonts-ipafont-gothic fontswqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 --noinstall-recommends && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .
USER node
EXPOSE 3000
CMD ['node', 'server.js']