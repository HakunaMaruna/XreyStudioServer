FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --no-bin-links --omit=dev
COPY src ./src
EXPOSE 9090
CMD ["node", "src/index.js"]