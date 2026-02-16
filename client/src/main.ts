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
      // Walls on border, except a doorway at bottom-center
      const isDoor = isBottom && rx === room.x + Math.floor(room.w / 2);
      if ((isTop || isBottom || isLeft || isRight) && !isDoor) {
        map[ry][rx] = 1;
      }
    }
  }
}

// --- Player ---
let px = 10 * TILE;
let py = 7 * TILE;
let currentRoom: string | null = null;

// --- Input ---
const keys = new Set<string>();
window.addEventListener("keydown", (e) => keys.add(e.key));
window.addEventListener("keyup", (e) => keys.delete(e.key));

// --- Canvas ---
const canvas = document.getElementById("game") as HTMLCanvasElement;
canvas.width = MAP_W * TILE;
canvas.height = MAP_H * TILE;
const ctx = canvas.getContext("2d")!;

// --- Collision check ---
function canMove(x: number, y: number): boolean {
  // Check all 4 corners of the avatar (slightly smaller than a tile)
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

  // Room areas (highlight)
  for (const room of rooms) {
    const isInside = currentRoom === room.id;
    ctx.fillStyle = isInside ? "rgba(100, 200, 100, 0.15)" : "rgba(80, 120, 200, 0.1)";
    ctx.fillRect(room.x * TILE, room.y * TILE, room.w * TILE, room.h * TILE);

    // Room name
    ctx.fillStyle = isInside ? "#8f8" : "#889";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(room.name, (room.x + room.w / 2) * TILE, (room.y + 1) * TILE + 12);
  }

  // Player
  ctx.fillStyle = "#f0c040";
  ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);

  // Player name
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

  // Try move on each axis independently
  if (canMove(nx, py)) px = nx;
  if (canMove(px, ny)) py = ny;

  const newRoom = detectRoom(px, py);
  if (newRoom !== currentRoom) {
    if (currentRoom) console.log(`退室: ${currentRoom}`);
    if (newRoom) console.log(`入室: ${newRoom}`);
    currentRoom = newRoom;
  }

  draw();
  requestAnimationFrame(update);
}

update();
