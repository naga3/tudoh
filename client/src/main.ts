const TILE = 32;
const MAP_W = 20;
const MAP_H = 15;
const SPEED = 3;
const BUBBLE_DURATION = 5000; // ms

// --- Sprites ---
const SPRITE_NAMES = [
  "Soldier-Blue",
  "Soldier-Red",
  "Mage-Cyan",
  "Mage-Red",
  "Warrior-Blue",
  "Archer-Green",
];
const FRAME_SIZE = 32;
const DIR_ROW: Record<string, number> = { down: 0, right: 2, up: 4, left: 6 };
const WALK_FRAMES = 4;

// Load all sprite sheets
const spriteImages = new Map<string, HTMLImageElement>();
for (const name of SPRITE_NAMES) {
  const img = new Image();
  img.src = `/sprites/${name}.png`;
  spriteImages.set(name, img);
}

// Load tile images
const tileImages: Record<string, HTMLImageElement> = {};
for (const name of ["Grass1", "Grass2", "Dirt", "Tree"]) {
  const img = new Image();
  img.src = `/sprites/${name}.png`;
  tileImages[name] = img;
}

function spriteForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return SPRITE_NAMES[Math.abs(hash) % SPRITE_NAMES.length];
}

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
let mySprite = SPRITE_NAMES[0];
let px = 10 * TILE;
let py = 7 * TILE;
let facing: string = "down";
let walking = false;
let animFrame = 0;
let animTick = 0;
let currentRoom: string | null = null;

// --- Chat ---
let chatMode = false;
let chatInput = "";
type Bubble = { text: string; expires: number };
const bubbles = new Map<string, Bubble>(); // keyed by player id

type OtherPlayer = { x: number; y: number; name: string; facing: string; walking: boolean };
const others = new Map<string, OtherPlayer>();

// --- Input ---
const keys = new Set<string>();
const chatEl = document.getElementById("chat-input") as HTMLInputElement;
let composing = false;

chatEl.addEventListener("compositionstart", () => { composing = true; });
chatEl.addEventListener("compositionend", () => { composing = false; });

chatEl.addEventListener("keydown", (e) => {
  if (composing) return; // IME 変換中は無視
  if (e.key === "Escape") {
    chatMode = false;
    chatInput = "";
    chatEl.value = "";
    chatEl.blur();
    e.preventDefault();
  } else if (e.key === "Enter") {
    const text = chatEl.value.trim();
    if (text) {
      sendChat(text);
      bubbles.set(myId, { text, expires: Date.now() + BUBBLE_DURATION });
    }
    chatMode = false;
    chatInput = "";
    chatEl.value = "";
    chatEl.blur();
    e.preventDefault();
  }
});

chatEl.addEventListener("input", () => {
  chatInput = chatEl.value;
});

window.addEventListener("keydown", (e) => {
  if (chatMode) return;

  if (e.key === "Enter") {
    chatMode = true;
    chatInput = "";
    chatEl.value = "";
    chatEl.focus();
    e.preventDefault();
    return;
  }

  keys.add(e.key);
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.key);
});

// --- Canvas ---
const canvas = document.getElementById("game") as HTMLCanvasElement;
canvas.width = MAP_W * TILE;
canvas.height = MAP_H * TILE;
const ctx = canvas.getContext("2d")!;
ctx.imageSmoothingEnabled = false;

// --- WebSocket ---
function connect() {
  const ws = new WebSocket(`ws://${location.hostname}:3000/ws`);

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    if (msg.type === "welcome") {
      myId = msg.id;
      mySprite = spriteForId(myId);
    }

    if (msg.type === "players") {
      for (const p of msg.players) {
        if (p.id !== myId) {
          others.set(p.id, {
            x: p.x,
            y: p.y,
            name: p.name,
            facing: p.facing ?? "down",
            walking: p.walking ?? false,
          });
        }
      }
    }

    if (msg.type === "leave") {
      others.delete(msg.id);
      bubbles.delete(msg.id);
    }

    if (msg.type === "chat") {
      bubbles.set(msg.id, { text: msg.text, expires: Date.now() + BUBBLE_DURATION });
    }
  };

  ws.onclose = () => {
    others.clear();
    setTimeout(connect, 1000);
  };

  return ws;
}

let ws = connect();

let lastSentX = px;
let lastSentY = py;

function sendPosition() {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (px === lastSentX && py === lastSentY && !walking) return;
  lastSentX = px;
  lastSentY = py;
  ws.send(JSON.stringify({ type: "move", x: px, y: py, name: "Player", facing, walking }));
}

function sendChat(text: string) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "chat", text }));
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

// --- Draw sprite ---
function drawSprite(spriteName: string, x: number, y: number, dir: string, isWalking: boolean, frame: number) {
  const img = spriteImages.get(spriteName);
  if (!img || !img.complete) {
    ctx.fillStyle = spriteName === mySprite ? "#f0c040" : "#40a0f0";
    ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
    return;
  }
  const row = DIR_ROW[dir] ?? 0;
  const col = isWalking ? frame % WALK_FRAMES : 0;
  const drawSize = TILE * 2;
  const offset = (TILE - drawSize) / 2;
  ctx.drawImage(
    img,
    col * FRAME_SIZE, row * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE,
    x + offset, y + offset, drawSize, drawSize,
  );
}

// --- Draw speech bubble ---
function drawBubble(text: string, x: number, y: number) {
  ctx.font = "11px sans-serif";
  const metrics = ctx.measureText(text);
  const tw = metrics.width;
  const padX = 6;
  const padY = 4;
  const bw = tw + padX * 2;
  const bh = 16 + padY * 2;
  const bx = x + TILE / 2 - bw / 2;
  const by = y - TILE - bh;

  // Bubble background
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 4);
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Tail
  const tailX = x + TILE / 2;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(tailX - 4, by + bh);
  ctx.lineTo(tailX, by + bh + 6);
  ctx.lineTo(tailX + 4, by + bh);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(tailX - 4, by + bh);
  ctx.lineTo(tailX, by + bh + 6);
  ctx.lineTo(tailX + 4, by + bh);
  ctx.strokeStyle = "#333";
  ctx.stroke();

  // Text
  ctx.fillStyle = "#222";
  ctx.textAlign = "center";
  ctx.fillText(text, x + TILE / 2, by + padY + 12);
}

// --- Render ---
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const now = Date.now();

  // Expire old bubbles
  for (const [id, bubble] of bubbles) {
    if (now >= bubble.expires) bubbles.delete(id);
  }

  // Tiles
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const isWall = map[y][x] === 1;
      const tileImg = isWall ? tileImages["Dirt"] : tileImages["Grass1"];
      if (tileImg?.complete) {
        ctx.drawImage(tileImg, x * TILE, y * TILE, TILE, TILE);
      } else {
        ctx.fillStyle = isWall ? "#2a2a4a" : "#3a3a5a";
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
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
  for (const [id, other] of others) {
    drawSprite(spriteForId(id), other.x, other.y, other.facing, other.walking, animFrame);
    ctx.fillStyle = "#adf";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(other.name, other.x + TILE / 2, other.y - TILE / 2 - 2);
    const bubble = bubbles.get(id);
    if (bubble) drawBubble(bubble.text, other.x, other.y);
  }

  // Local player
  drawSprite(mySprite, px, py, facing, walking, animFrame);
  ctx.fillStyle = "#fff";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("You", px + TILE / 2, py - TILE / 2 - 2);
  const myBubble = bubbles.get(myId);
  if (myBubble) drawBubble(myBubble.text, px, py);

  // Chat input overlay
  if (chatMode) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, canvas.height - 32, canvas.width, 32);
    ctx.fillStyle = "#fff";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`> ${chatInput}_`, 8, canvas.height - 10);
  }

  // Room status
  if (!chatMode) {
    ctx.fillStyle = "#fff";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "left";
    const roomName = rooms.find((r) => r.id === currentRoom)?.name;
    ctx.fillText(roomName ? `📍 ${roomName}` : "廊下", 8, canvas.height - 8);
  }
}

// --- Game loop ---
function update() {
  if (!chatMode) {
    let nx = px;
    let ny = py;
    let moved = false;

    if (keys.has("ArrowUp") || keys.has("w")) { ny -= SPEED; facing = "up"; moved = true; }
    if (keys.has("ArrowDown") || keys.has("s")) { ny += SPEED; facing = "down"; moved = true; }
    if (keys.has("ArrowLeft") || keys.has("a")) { nx -= SPEED; facing = "left"; moved = true; }
    if (keys.has("ArrowRight") || keys.has("d")) { nx += SPEED; facing = "right"; moved = true; }

    if (canMove(nx, py)) px = nx;
    if (canMove(px, ny)) py = ny;

    walking = moved;
  } else {
    walking = false;
  }

  animTick++;
  if (animTick >= 8) {
    animTick = 0;
    animFrame = (animFrame + 1) % WALK_FRAMES;
  }

  const newRoom = detectRoom(px, py);
  if (newRoom !== currentRoom) {
    currentRoom = newRoom;
  }

  sendPosition();
  draw();
  requestAnimationFrame(update);
}

update();
