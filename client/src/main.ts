const TILE = 32;
const MAP_W = 20;
const MAP_H = 15;
const SPEED = 3;

// --- Map (0=floor, 1=wall) ---
const map: number[][] = Array.from({ length: MAP_H }, (_, y) =>
  Array.from({ length: MAP_W }, (_, x) =>
    y === 0 || y === MAP_H - 1 || x === 0 || x === MAP_W - 1 ? 1 : 0
  )
);

// --- Rooms ---
const rooms = [
  { id: "room-a", name: "会議室A", x: 2, y: 2, w: 5, h: 4 },
  { id: "room-b", name: "会議室B", x: 13, y: 2, w: 5, h: 4 },
  { id: "room-c", name: "休憩室", x: 2, y: 9, w: 5, h: 4 },
];

// Add room walls
for (const room of rooms) {
  for (let ry = room.y; ry < room.y + room.h; ry++) {
    for (let rx = room.x; rx < room.x + room.w; rx++) {
      const isTop = ry === room.y;
      const isBottom = ry === room.y + room.h - 1;
      const isLeft = rx === room.x;
      const isRight = rx === room.x + room.w - 1;
      const isDoor = isBottom && rx === room.x + Math.floor(room.w / 2);
      if ((isTop || isBottom || isLeft || isRight) && !isDoor) {
        map[ry][rx] = 1;
      }
    }
  }
}

// --- Player ---
let myId = "";
let px = 10 * TILE;
let py = 7 * TILE;
let currentRoom: string | null = null;

type OtherPlayer = { x: number; y: number; name: string };
const others = new Map<string, OtherPlayer>();

// --- Input ---
const keys = new Set<string>();
window.addEventListener("keydown", (e) => keys.add(e.key));
window.addEventListener("keyup", (e) => keys.delete(e.key));

// --- Canvas ---
const canvas = document.getElementById("game") as HTMLCanvasElement;
canvas.width = MAP_W * TILE;
canvas.height = MAP_H * TILE;
const ctx = canvas.getContext("2d")!;

// --- WebSocket ---
function connect() {
  const ws = new WebSocket(`ws://${location.hostname}:3000/ws`);

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    if (msg.type === "welcome") {
      myId = msg.id;
    }

    if (msg.type === "players") {
      for (const p of msg.players) {
        if (p.id !== myId) {
          others.set(p.id, { x: p.x, y: p.y, name: p.name });
        }
      }
    }

    if (msg.type === "leave") {
      others.delete(msg.id);
    }
  };

  ws.onclose = () => {
    others.clear();
    setTimeout(connect, 1000);
  };

  return ws;
}

let ws = connect();

// Send position when moving
let lastSentX = px;
let lastSentY = py;

function sendPosition() {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (px === lastSentX && py === lastSentY) return;
  lastSentX = px;
  lastSentY = py;
  ws.send(JSON.stringify({ type: "move", x: px, y: py, name: "Player" }));
}

// --- Collision check ---
function canMove(x: number, y: number): boolean {
  const pad = 4;
  const corners = [
    [x + pad, y + pad],
    [x + TILE - pad - 1, y + pad],
    [x + pad, y + TILE - pad - 1],
    [x + TILE - pad - 1, y + TILE - pad - 1],
  ];
  return corners.every(([cx, cy]) => {
    const tx = Math.floor(cx / TILE);
    const ty = Math.floor(cy / TILE);
    return tx >= 0 && tx < MAP_W && ty >= 0 && ty < MAP_H && map[ty][tx] === 0;
  });
}

// --- Room detection ---
function detectRoom(x: number, y: number): string | null {
  const cx = Math.floor((x + TILE / 2) / TILE);
  const cy = Math.floor((y + TILE / 2) / TILE);
  for (const room of rooms) {
    if (cx >= room.x && cx < room.x + room.w && cy >= room.y && cy < room.y + room.h) {
      return room.id;
    }
  }
  return null;
}

// --- Render ---
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Tiles
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      ctx.fillStyle = map[y][x] === 1 ? "#2a2a4a" : "#3a3a5a";
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      ctx.strokeStyle = "#2e2e4e";
      ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);
    }
  }

  // Room areas
  for (const room of rooms) {
    const isInside = currentRoom === room.id;
    ctx.fillStyle = isInside ? "rgba(100, 200, 100, 0.15)" : "rgba(80, 120, 200, 0.1)";
    ctx.fillRect(room.x * TILE, room.y * TILE, room.w * TILE, room.h * TILE);
    ctx.fillStyle = isInside ? "#8f8" : "#889";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(room.name, (room.x + room.w / 2) * TILE, (room.y + 1) * TILE + 12);
  }

  // Other players
  for (const [, other] of others) {
    ctx.fillStyle = "#40a0f0";
    ctx.fillRect(other.x + 4, other.y + 4, TILE - 8, TILE - 8);
    ctx.fillStyle = "#adf";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(other.name, other.x + TILE / 2, other.y - 4);
  }

  // Local player
  ctx.fillStyle = "#f0c040";
  ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
  ctx.fillStyle = "#fff";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("You", px + TILE / 2, py - 4);

  // Room status
  ctx.fillStyle = "#fff";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "left";
  const roomName = rooms.find((r) => r.id === currentRoom)?.name;
  ctx.fillText(roomName ? `📍 ${roomName}` : "廊下", 8, canvas.height - 8);
}

// --- Game loop ---
function update() {
  let nx = px;
  let ny = py;

  if (keys.has("ArrowUp") || keys.has("w")) ny -= SPEED;
  if (keys.has("ArrowDown") || keys.has("s")) ny += SPEED;
  if (keys.has("ArrowLeft") || keys.has("a")) nx -= SPEED;
  if (keys.has("ArrowRight") || keys.has("d")) nx += SPEED;

  if (canMove(nx, py)) px = nx;
  if (canMove(px, ny)) py = ny;

  const newRoom = detectRoom(px, py);
  if (newRoom !== currentRoom) {
    currentRoom = newRoom;
  }

  sendPosition();
  draw();
  requestAnimationFrame(update);
}

update();
