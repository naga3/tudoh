FROM oven/bun:1 AS dev

WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install
COPY . .

EXPOSE 5173
CMD ["bun", "run", "dev"]
