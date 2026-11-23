FROM node:20-alpine
RUN apk add --no-cache postgresql-client
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["node", "node_modules/@nestjs/cli/bin/nest.js", "start"]
