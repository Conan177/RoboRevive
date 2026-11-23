FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY gateway.js creaGateway.js scenari.js simulazione.js risolviIntervalloS.js ./
USER node
CMD ["node", "gateway.js"]
