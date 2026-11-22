FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --no-bin-links
COPY . .
RUN npx prisma generate || true
EXPOSE 3000
CMD ["node", "node_modules/@nestjs/cli/bin/nest.js", "start"]