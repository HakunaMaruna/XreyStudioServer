FROM node:20-alpine
# MCP SDK zod-типы делают компиляцию Nest тяжелее — даём tsc достаточно heap.
ENV NODE_OPTIONS=--max-old-space-size=3072
RUN apk add --no-cache postgresql-client openssl certbot
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["node", "node_modules/@nestjs/cli/bin/nest.js", "start"]
