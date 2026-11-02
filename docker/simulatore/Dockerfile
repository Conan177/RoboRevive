FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY gateway.js ./
COPY creaGateway.js ./
COPY scenari.js ./
COPY simulazione.js ./
CMD ["node", "gateway.js"]
