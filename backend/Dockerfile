FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache postgresql-client
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["node", "node_modules/@nestjs/cli/bin/nest.js", "start"]
