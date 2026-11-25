FROM node:20-alpine

RUN apk add --no-cache git docker-cli docker-cli-compose \
    # Каталог репозитория смонтирован с хоста: git должен доверять ему.
    && git config --system --add safe.directory /workspace

WORKDIR /app
COPY index.js ./

ENV PORT=7070
EXPOSE 7070

CMD ["node", "index.js"]
