FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

ENV PORT=8787
EXPOSE 8787
CMD ["npm", "start"]
