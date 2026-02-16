import type { ServerWebSocket } from "bun";

type Player = {
  id: string;
  x: number;
  y: number;
  name: string;
  facing: string;
  walking: boolean;
};

type WsData = {
  id: string;
};

// --- State ---
const players = new Map<string, Player>();
const sockets = new Map<string, ServerWebSocket<WsData>>();

// --- Tick: broadcast positions of players who moved ---
const TICK_MS = 100; // 10Hz
const dirty = new Set<string>();

setInterval(() => {
  if (dirty.size === 0) return;

  const updates: Player[] = [];
  for (const id of dirty) {
    const p = players.get(id);
    if (p) updates.push(p);
  }
  dirty.clear();

  const msg = JSON.stringify({ type: "players", players: updates });
  for (const ws of sockets.values()) {
    ws.send(msg);
  }
}, TICK_MS);

// --- Server ---
const server = Bun.serve<WsData>({
  port: 3000,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const id = crypto.randomUUID();
      const upgraded = server.upgrade(req, { data: { id } });
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    return new Response("tudoh server");
  },

  websocket: {
    open(ws) {
      const { id } = ws.data;
      sockets.set(id, ws);

      // Send the new player their ID
      ws.send(JSON.stringify({ type: "welcome", id }));

      // Send full state of all existing players
      ws.send(
        JSON.stringify({
          type: "players",
          players: Array.from(players.values()),
          full: true,
        })
      );

      console.log(`[connect] ${id} (total: ${sockets.size})`);
    },

    message(ws, raw) {
      const { id } = ws.data;
      const msg = JSON.parse(raw as string);

      if (msg.type === "move") {
        const player: Player = {
          id,
          x: msg.x,
          y: msg.y,
          name: msg.name ?? "???",
          facing: msg.facing ?? "down",
          walking: msg.walking ?? false,
        };
        players.set(id, player);
        dirty.add(id);
      }
    },

    close(ws) {
      const { id } = ws.data;
      players.delete(id);
      sockets.delete(id);

      // Notify others that this player left
      const msg = JSON.stringify({ type: "leave", id });
      for (const s of sockets.values()) {
        s.send(msg);
      }

      console.log(`[disconnect] ${id} (total: ${sockets.size})`);
    },
  },
});

console.log(`tudoh server listening on :${server.port}`);
