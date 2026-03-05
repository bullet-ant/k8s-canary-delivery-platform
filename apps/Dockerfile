FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public/ ./public/

ENV PORT=5000
EXPOSE 5000

USER node

CMD ["node", "server.js"]
