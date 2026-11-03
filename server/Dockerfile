FROM oven/bun:1.3.9

WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install
COPY . .

EXPOSE 15141
CMD ["bun", "run", "dev"]
