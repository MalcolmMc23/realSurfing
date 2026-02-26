import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ── Constants ──────────────────────────────────────────────────────────
const LANE_XS      = [-3, 0, 3];
const LANE_COUNT   = 3;
const SPEED         = 0.25;
const PLAYER_LERP   = 0.10;
const TILT_LERP     = 0.08;
const MAX_TILT      = 0.18;
const TILE_LEN      = 30;
const TILE_COUNT    = 7;
const ROAD_WIDTH    = 10;
const BARRIER_H     = 1.2;
const BARRIER_W     = 0.3;
const DASH_LEN      = 2.0;
const DASH_GAP      = 2.0;
const DASH_COUNT    = Math.ceil(TILE_LEN / (DASH_LEN + DASH_GAP));

// Train / obstacle constants
const TRAIN_W        = 2.6;
const TRAIN_H        = 2.8;
const TRAIN_LENGTHS  = [10, 16, 22, 28];
const RAMP_LEN       = 7;
const TRAIN_TOP_Y    = 2.9;
const MOVING_BONUS   = 0.35;
const SPAWN_MIN      = 25;
const SPAWN_VARIANCE = 20;
const MAX_EXTRA_SPEED = 0.4;
const FAR_Z          = -(TILE_COUNT * TILE_LEN) - 28;

// ── Renderer ───────────────────────────────────────────────────────────
const canvas   = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// ── Scene ──────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog        = new THREE.Fog(0x87ceeb, 60, 180);

// ── Camera ─────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 300
);
camera.position.set(0, 7, 12);
camera.lookAt(0, 1, -8);

// ── Lighting ───────────────────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff4e0, 1.4);
sun.position.set(10, 20, 8);
sun.castShadow             = true;
sun.shadow.mapSize.width   = 2048;
sun.shadow.mapSize.height  = 2048;
sun.shadow.camera.left     = -30;
sun.shadow.camera.right    = 30;
sun.shadow.camera.top      = 30;
sun.shadow.camera.bottom   = -30;
sun.shadow.camera.near     = 1;
sun.shadow.camera.far      = 80;
sun.shadow.bias             = -0.002;
scene.add(sun);

// ── Materials (shared) ─────────────────────────────────────────────────
const matAsphalt  = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 });
const matGrass    = new THREE.MeshStandardMaterial({ color: 0x3a8c3f, roughness: 1.0 });
const matBarrierR = new THREE.MeshStandardMaterial({ color: 0xcc2222 });
const matBarrierW = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
const matDash     = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
const matBody     = new THREE.MeshStandardMaterial({ color: 0xf59e0b });
const matHead     = new THREE.MeshStandardMaterial({ color: 0xfcd9b6 });
const matEye      = new THREE.MeshStandardMaterial({ color: 0x222222 });

// Train materials
const matTrainSolid   = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.7 });
const matTrainMoving  = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.7 });
const matTrainRamp    = new THREE.MeshStandardMaterial({ color: 0x2d5a1b, roughness: 0.7 });
const matTrainStripe  = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 });
const matTrainWindow  = new THREE.MeshStandardMaterial({ color: 0xffff88, emissive: 0xffff44, emissiveIntensity: 0.6 });
const matTrainHeadlight = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffff99, emissiveIntensity: 1.5 });
const matRamp         = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.8, side: THREE.DoubleSide });

// Coin material
const matCoin = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xaa8800, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.7 });

// ── Grass ground ───────────────────────────────────────────────────────
const grassGeo = new THREE.PlaneGeometry(200, TILE_COUNT * TILE_LEN + 60);
const grass    = new THREE.Mesh(grassGeo, matGrass);
grass.rotation.x = -Math.PI / 2;
grass.position.set(0, -0.05, -(TILE_COUNT * TILE_LEN) / 2 + TILE_LEN);
grass.receiveShadow = true;
scene.add(grass);

// ── Road tiles (recycling pool) ────────────────────────────────────────
const tiles = [];
const tileGeo = new THREE.PlaneGeometry(ROAD_WIDTH, TILE_LEN);

for (let i = 0; i < TILE_COUNT; i++) {
  const tile = new THREE.Mesh(tileGeo, matAsphalt);
  tile.rotation.x = -Math.PI / 2;
  tile.position.set(0, 0, -i * TILE_LEN);
  tile.receiveShadow = true;
  scene.add(tile);
  tiles.push(tile);
}

// ── Side barriers ──────────────────────────────────────────────────────
const barrierGeo = new THREE.BoxGeometry(BARRIER_W, BARRIER_H, TILE_LEN);
const barrierSegments = [];

for (let i = 0; i < TILE_COUNT; i++) {
  for (const side of [-1, 1]) {
    const x = side * (ROAD_WIDTH / 2 + BARRIER_W / 2);
    const group = new THREE.Group();
    const halfH = BARRIER_H / 2;
    const topBox = new THREE.Mesh(
      new THREE.BoxGeometry(BARRIER_W, halfH, TILE_LEN),
      i % 2 === 0 ? matBarrierR : matBarrierW
    );
    topBox.position.y = halfH / 2 + halfH;
    topBox.castShadow = true;

    const botBox = new THREE.Mesh(
      new THREE.BoxGeometry(BARRIER_W, halfH, TILE_LEN),
      i % 2 === 0 ? matBarrierW : matBarrierR
    );
    botBox.position.y = halfH / 2;
    botBox.castShadow = true;

    group.add(topBox, botBox);
    group.position.set(x, 0, -i * TILE_LEN);
    group.userData.tileIndex = i;
    group.userData.side = side;
    scene.add(group);
    barrierSegments.push(group);
  }
}

// ── Lane dividers (white dashes) ───────────────────────────────────────
const dashGeo = new THREE.PlaneGeometry(0.15, DASH_LEN);
const dashGroups = [];

for (let i = 0; i < TILE_COUNT; i++) {
  const group = new THREE.Group();
  for (let laneDiv = 0; laneDiv < 2; laneDiv++) {
    const x = LANE_XS[laneDiv] + (LANE_XS[laneDiv + 1] - LANE_XS[laneDiv]) / 2;
    for (let d = 0; d < DASH_COUNT; d++) {
      const z = -d * (DASH_LEN + DASH_GAP);
      const dash = new THREE.Mesh(dashGeo, matDash);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.01, z);
      group.add(dash);
    }
  }
  group.position.z = -i * TILE_LEN;
  scene.add(group);
  dashGroups.push(group);
}

// ── Player character ───────────────────────────────────────────────────
const playerGroup = new THREE.Group();

const bodyGeo = new THREE.BoxGeometry(0.8, 1.4, 0.6);
const body    = new THREE.Mesh(bodyGeo, matBody);
body.position.y = 1.2;
body.castShadow = true;
playerGroup.add(body);

const headGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
const head    = new THREE.Mesh(headGeo, matHead);
head.position.y = 2.2;
head.castShadow = true;
playerGroup.add(head);

const eyeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.05);
for (const side of [-1, 1]) {
  const eye = new THREE.Mesh(eyeGeo, matEye);
  eye.position.set(side * 0.15, 2.25, -0.33);
  playerGroup.add(eye);
}

const legGeo = new THREE.BoxGeometry(0.25, 0.7, 0.3);
const leftLeg  = new THREE.Mesh(legGeo, matBody);
const rightLeg = new THREE.Mesh(legGeo, matBody);
leftLeg.position.set(-0.2, 0.35, 0);
rightLeg.position.set(0.2, 0.35, 0);
leftLeg.castShadow  = true;
rightLeg.castShadow = true;
playerGroup.add(leftLeg, rightLeg);

playerGroup.position.set(0, 0, 0);
scene.add(playerGroup);

// ── Player state ───────────────────────────────────────────────────────
// States: 'running' | 'jumping' | 'rolling' | 'onTrain'
const JUMP_VELOCITY  = 0.22;
const GRAVITY        = 0.012;
const ROLL_DURATION  = 0.7;

const player = {
  lane: 1,
  x: 0,
  tilt: 0,
  state: 'running',  // replaces isJumping / isRolling / onTrainTop
  jumpY: 0,
  jumpVY: 0,
  rollTimer: 0,
  trainRef: null,    // which obstacle we're riding (only valid in 'onTrain')
};

function doJump() {
  if (player.state === 'onTrain') {
    // Jump off roof
    player.state   = 'jumping';
    player.trainRef = null;
    player.jumpVY  = JUMP_VELOCITY;
    return;
  }
  if (player.state === 'jumping') return;
  player.state     = 'jumping';
  player.rollTimer = 0;
  player.jumpVY    = JUMP_VELOCITY;
}

function doRoll() {
  if (player.state !== 'running') return;
  player.state     = 'rolling';
  player.rollTimer = ROLL_DURATION;
}

// ── Game state ─────────────────────────────────────────────────────────
const game = {
  state:     'playing',
  distance:  0,
  coins:     0,
  nextSpawn: 15,
  speed:     SPEED,
};

// ── HUD elements ───────────────────────────────────────────────────────
const hudScore   = document.getElementById('hud-score');
const hudCoins   = document.getElementById('hud-coins');
const gameOverEl = document.getElementById('game-over');
const goScore    = document.getElementById('go-score');
const goCoins    = document.getElementById('go-coins');
const goRestart  = document.getElementById('go-restart');

function updateHUD() {
  hudScore.textContent = Math.floor(game.distance) + 'm';
  hudCoins.textContent = '🪙 ' + game.coins;
  if (game.state === 'dead') {
    gameOverEl.style.display = 'flex';
    goScore.textContent = '📏 ' + Math.floor(game.distance) + ' meters';
    goCoins.textContent = '🪙 ' + game.coins + ' coins';
  } else {
    gameOverEl.style.display = 'none';
  }
}

function showGameOver() {
  game.state = 'dead';
  updateHUD();
}

function resetGame() {
  game.state     = 'playing';
  game.distance  = 0;
  game.coins     = 0;
  game.nextSpawn = 15;
  nextCoinSpawn  = 10;
  game.speed     = SPEED;

  player.lane      = 1;
  player.x         = 0;
  player.tilt      = 0;
  player.state     = 'running';
  player.jumpY     = 0;
  player.jumpVY    = 0;
  player.rollTimer = 0;
  player.trainRef  = null;

  playerGroup.position.set(0, 0, 0);
  playerGroup.scale.set(1, 1, 1);
  playerGroup.rotation.set(0, 0, 0);

  // Return all active obstacles to pool
  for (const obs of activeObstacles) {
    obs.group.visible = false;
    obs.active = false;
    obstaclePool.push(obs);
  }
  activeObstacles.length = 0;

  // Return all active coins to pool
  for (const c of activeCoins) {
    c.mesh.visible = false;
    coinPool.push(c);
  }
  activeCoins.length = 0;

  gameOverEl.style.display = 'none';
  updateHUD();
}

goRestart.addEventListener('click', resetGame);

// ── Train mesh builder ─────────────────────────────────────────────────
// Types: 'solid' (stationary, no ramp), 'moving' (oncoming, no ramp), 'ramp' (stationary, climbable)
function buildTrainMesh(type, len = 16) {
  const group = new THREE.Group();

  const bodyMat = type === 'moving' ? matTrainMoving
                : type === 'ramp'   ? matTrainRamp
                :                     matTrainSolid;

  // Main body
  const trainBody = new THREE.Mesh(
    new THREE.BoxGeometry(TRAIN_W, TRAIN_H, len),
    bodyMat
  );
  trainBody.position.y = TRAIN_H / 2;
  trainBody.castShadow = true;
  group.add(trainBody);

  // Roof stripe
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(TRAIN_W, 0.12, len),
    matTrainStripe
  );
  stripe.position.y = TRAIN_H + 0.06;
  group.add(stripe);

  // Windows — scaled with train length
  const winCount   = Math.max(2, Math.floor(len / 5));
  const winSpacing = len / (winCount + 1);
  const winGeo     = new THREE.BoxGeometry(0.5, 0.5, 0.05);
  for (let w = 0; w < winCount; w++) {
    const wz  = -len / 2 + winSpacing * (w + 1);
    const win = new THREE.Mesh(winGeo, matTrainWindow);
    win.position.set(0, TRAIN_H * 0.6, wz);
    group.add(win);
  }

  if (type === 'moving') {
    // Headlights at the front (toward player — positive Z end)
    const hlGeo = new THREE.BoxGeometry(0.4, 0.25, 0.05);
    for (const hx of [-0.7, 0.7]) {
      const hl = new THREE.Mesh(hlGeo, matTrainHeadlight);
      hl.position.set(hx, TRAIN_H * 0.35, len / 2 + 0.03);
      group.add(hl);
    }
  }

  // Only 'ramp' type trains have a climbable ramp
  if (type === 'ramp') {
    const rampGeo = new THREE.PlaneGeometry(TRAIN_W, RAMP_LEN);
    const ramp = new THREE.Mesh(rampGeo, matRamp);
    const angle = Math.atan2(TRAIN_H, RAMP_LEN);
    ramp.rotation.x = -(Math.PI / 2 - angle);
    ramp.position.set(0, TRAIN_H / 2 * Math.sin(angle), len / 2 + RAMP_LEN / 2 * Math.cos(angle));
    group.add(ramp);
  }

  return group;
}

// ── Obstacle pool ──────────────────────────────────────────────────────
const obstaclePool   = [];
const activeObstacles = [];

function getObstacleFromPool(type, len) {
  // Look for a matching type+length in pool
  const idx = obstaclePool.findIndex(o => o.type === type && o.len === len);
  if (idx !== -1) {
    const obs = obstaclePool.splice(idx, 1)[0];
    obs.active = true;
    obs.group.visible = true;
    return obs;
  }
  // Create new
  const group = buildTrainMesh(type, len);
  scene.add(group);
  return {
    group,
    type,
    len,
    lane: 1,
    speed: SPEED,
    active: true,
    onRamp: false,
  };
}

// ── Spawn event helpers ────────────────────────────────────────────────
function randLane()  { return Math.floor(Math.random() * 3); }
function randLen()   { return TRAIN_LENGTHS[Math.floor(Math.random() * TRAIN_LENGTHS.length)]; }
function shuffleLanes() { return [0, 1, 2].sort(() => Math.random() - 0.5); }

function pickType() {
  const r = Math.random();
  return r < 0.4 ? 'solid' : r < 0.7 ? 'moving' : 'ramp';
}

function pickNonMoving() {
  return Math.random() < 0.55 ? 'solid' : 'ramp';
}

function placeTrain(type, lane, z, len) {
  const obs  = getObstacleFromPool(type, len);
  obs.lane   = lane;
  obs.len    = len;
  obs.onRamp = false;
  obs.speed  = type === 'moving' ? game.speed + MOVING_BONUS : game.speed;
  obs.group.position.set(LANE_XS[lane], 0, z);
  obs.group.visible = true;
  activeObstacles.push(obs);
}

function spawnSingle() {
  placeTrain(pickType(), randLane(), FAR_Z, randLen());
}

function spawnPair() {
  const lanes = shuffleLanes().slice(0, 2);
  // Guarantee at least 1 ramp so player has a climbable option
  const types = ['ramp', pickNonMoving()].sort(() => Math.random() - 0.5);
  for (let i = 0; i < 2; i++) {
    placeTrain(types[i], lanes[i], FAR_Z, randLen());
  }
}

function spawnWall() {
  const types = [pickNonMoving(), pickNonMoving(), pickNonMoving()];
  // Guarantee at least 1 ramp so player can survive
  if (!types.includes('ramp')) types[Math.floor(Math.random() * 3)] = 'ramp';
  for (let lane = 0; lane < 3; lane++) {
    placeTrain(types[lane], lane, FAR_Z, randLen());
  }
}

function spawnConvoy() {
  const lane  = randLane();
  const count = 2 + Math.floor(Math.random() * 2); // 2 or 3
  let z = FAR_Z;
  for (let i = 0; i < count; i++) {
    const len = randLen();
    placeTrain(pickNonMoving(), lane, z, len);
    z -= len + 4 + Math.random() * 8;
  }
}

function spawnEvent() {
  const r = Math.random();
  if      (r < 0.40) spawnSingle();
  else if (r < 0.70) spawnPair();
  else if (r < 0.85) spawnWall();
  else               spawnConvoy();
}

// ── Coin pool ──────────────────────────────────────────────────────────
const coinPool   = [];
const activeCoins = [];
const coinGeo    = new THREE.SphereGeometry(0.25, 8, 8);
const COIN_Y     = 1.5;

function getCoinFromPool() {
  if (coinPool.length > 0) {
    const c = coinPool.pop();
    c.mesh.visible = true;
    return c;
  }
  const mesh = new THREE.Mesh(coinGeo, matCoin);
  mesh.castShadow = false;
  scene.add(mesh);
  return { mesh, collected: false };
}

function spawnCoinRow(lane, startZ, count) {
  for (let i = 0; i < count; i++) {
    const c = getCoinFromPool();
    c.collected = false;
    c.mesh.position.set(LANE_XS[lane], COIN_Y, startZ - i * 2);
    c.mesh.visible = true;
    activeCoins.push(c);
  }
}

function spawnCoinArc(lane, startZ, count) {
  for (let i = 0; i < count; i++) {
    const c = getCoinFromPool();
    c.collected = false;
    const arcY = COIN_Y + Math.sin((i / (count - 1)) * Math.PI) * 2.5;
    c.mesh.position.set(LANE_XS[lane], arcY, startZ - i * 2.5);
    c.mesh.visible = true;
    activeCoins.push(c);
  }
}

// Spawn coins independently of obstacles (every 15-30 units)
let nextCoinSpawn = 10;

function maybeSpawnCoins() {
  if (game.distance < nextCoinSpawn) return;
  nextCoinSpawn = game.distance + 15 + Math.random() * 15;

  const lane  = Math.floor(Math.random() * LANE_COUNT);
  const startZ = -(TILE_COUNT * TILE_LEN);
  const count  = 6 + Math.floor(Math.random() * 6);

  if (Math.random() < 0.35) {
    spawnCoinArc(lane, startZ, count);
  } else {
    spawnCoinRow(lane, startZ, count);
  }
}

// ── Collision detection ────────────────────────────────────────────────
const CAMERA_Z = 12; // camera z

function checkCollision(obs) {
  // Immune while on any train roof
  if (player.state === 'onTrain') return false;
  // Immune while climbing this train's ramp
  if (player.trainRef === obs) return false;

  const oz     = obs.group.position.z;
  const zFront = oz + obs.len / 2;
  const zBack  = oz - obs.len / 2;
  const inZ    = zBack < 1.5 && zFront > -1.5;
  const inX    = Math.abs(player.x - LANE_XS[obs.lane]) < 1.8;

  if (!inZ || !inX) return false;

  // Player jumped over the train
  if (player.jumpY >= TRAIN_H) return false;

  return true;
}

// ── Ramp / roof interaction ────────────────────────────────────────────
// Only 'ramp' type trains support climbing and roof riding.
function updateRampPlayer(obs) {
  if (obs.type !== 'ramp') return;

  const inX = Math.abs(player.x - LANE_XS[obs.lane]) < 1.8;
  if (!inX) {
    // Player lane-changed away from this train — null ref, let resolveTrainTop decide
    if (player.trainRef === obs) player.trainRef = null;
    return;
  }

  const oz        = obs.group.position.z;
  const rampFront = oz + obs.len / 2 + RAMP_LEN;
  const rampBase  = oz + obs.len / 2;
  const trainBack = oz - obs.len / 2;

  // Ramp climbing phase
  if (player.state !== 'onTrain' && player.jumpY < TRAIN_TOP_Y + 0.5) {
    if (rampBase < 0 && rampFront > 0) {
      // Claim this obs so checkCollision skips it during climb
      if (player.trainRef === null) player.trainRef = obs;

      const progress = 1 - (rampFront / RAMP_LEN); // 0 at base → 1 at top
      const targetY  = progress * TRAIN_TOP_Y;
      if (targetY > player.jumpY) {
        player.jumpY  = targetY;
        player.state  = 'running'; // cancel jump physics while climbing
        player.jumpVY = 0;
      }
      if (progress >= 0.92) {
        player.state  = 'onTrain';
        player.jumpY  = TRAIN_TOP_Y;
        player.jumpVY = 0;
      }
    }
  }

  // Roof-riding phase
  if (player.state === 'onTrain' && player.trainRef === obs) {
    player.jumpY = TRAIN_TOP_Y;

    // Train back has passed the player — fall off rear
    if (trainBack > 1.5) {
      player.state   = 'jumping';
      player.trainRef = null;
      player.jumpVY  = 0;
      // jumpY stays at TRAIN_TOP_Y, gravity carries player down
    }
  }
}

// ── Roof-to-roof lane transfer ─────────────────────────────────────────
// Called after all updateRampPlayer calls each frame.
// If player is onTrain but trainRef was cleared (lane change), find the new train.
function resolveTrainTop() {
  if (player.state !== 'onTrain' || player.trainRef !== null) return;

  // Search for a ramp-type train under the player's current position
  for (const obs of activeObstacles) {
    if (obs.type !== 'ramp') continue;
    if (Math.abs(player.x - LANE_XS[obs.lane]) >= 1.8) continue;
    const oz = obs.group.position.z;
    if (oz - obs.len / 2 < 1.5 && oz + obs.len / 2 > -1.5) {
      // Found a train — transfer onto it
      player.trainRef = obs;
      player.jumpY    = TRAIN_TOP_Y;
      return;
    }
  }

  // No train below — fall
  player.state  = 'jumping';
  player.jumpVY = 0;
  // jumpY stays at TRAIN_TOP_Y, gravity takes over
}

// ── Obstacle update ────────────────────────────────────────────────────
function updateObstacles(dt) {
  for (let i = activeObstacles.length - 1; i >= 0; i--) {
    const obs = activeObstacles[i];

    // Sync speed: solid/ramp trains match world speed; moving trains keep their own speed
    if (obs.type !== 'moving') {
      obs.speed = game.speed;
    }

    obs.group.position.z += obs.speed;

    // Recycle if past camera
    if (obs.group.position.z > CAMERA_Z + obs.len) {
      obs.group.visible = false;
      obs.active = false;
      activeObstacles.splice(i, 1);
      obstaclePool.push(obs);
      continue;
    }

    // Ramp interaction (ramp-type only)
    updateRampPlayer(obs);

    // Collision check
    if (game.state === 'playing' && checkCollision(obs)) {
      showGameOver();
      return;
    }
  }

  // After all trains processed: resolve roof-to-roof transfer or fall
  resolveTrainTop();
}

// ── Coin update ────────────────────────────────────────────────────────
function updateCoins(time) {
  for (let i = activeCoins.length - 1; i >= 0; i--) {
    const c = activeCoins[i];

    // Scroll coin forward
    c.mesh.position.z += game.speed;

    // Rotate coin
    c.mesh.rotation.y += 0.05;

    // Recycle if past camera
    if (c.mesh.position.z > CAMERA_Z + 2) {
      c.mesh.visible = false;
      activeCoins.splice(i, 1);
      coinPool.push(c);
      continue;
    }

    // Collection check
    if (game.state !== 'playing') continue;
    const dz = Math.abs(c.mesh.position.z - 0);
    const dx = Math.abs(c.mesh.position.x - player.x);
    const dy = Math.abs(c.mesh.position.y - (player.jumpY + 1.5));
    if (dz < 1.0 && dx < 1.5 && dy < 1.5) {
      game.coins++;
      // Brief scale flash
      c.mesh.scale.set(2, 2, 2);
      setTimeout(() => {
        c.mesh.visible = false;
        c.mesh.scale.set(1, 1, 1);
        coinPool.push(c);
      }, 80);
      activeCoins.splice(i, 1);
    }
  }
}

// ── Input ──────────────────────────────────────────────────────────────
window.addEventListener('swipe', (e) => {
  if (game.state !== 'playing') return;
  const dir = e.detail;
  if (dir === 'left'  && player.lane > 0) player.lane--;
  if (dir === 'right' && player.lane < 2) player.lane++;
  if (dir === 'up')   doJump();
  if (dir === 'down') doRoll();
});

window.addEventListener('keydown', (e) => {
  if (game.state !== 'playing') return;
  if (e.key === 'ArrowLeft'  && player.lane > 0) player.lane--;
  if (e.key === 'ArrowRight' && player.lane < 2) player.lane++;
  if (e.key === 'ArrowUp')   doJump();
  if (e.key === 'ArrowDown') doRoll();
});

// ── Resize handler ─────────────────────────────────────────────────────
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);

// ── Scroll offset tracking ─────────────────────────────────────────────
let scrollZ = 0;

// ── Animation loop ─────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt   = clock.getDelta();
  const time = clock.getElapsedTime();

  if (game.state !== 'playing') {
    renderer.render(scene, camera);
    return;
  }

  // Speed ramp
  game.distance += game.speed;
  game.speed = SPEED + Math.min(game.distance * 0.0003, MAX_EXTRA_SPEED);

  // Spawn obstacles
  if (game.distance >= game.nextSpawn) {
    spawnEvent();
    game.nextSpawn = game.distance + SPAWN_MIN + Math.random() * SPAWN_VARIANCE;
  }

  // Spawn coins
  maybeSpawnCoins();

  const spd = game.speed;
  scrollZ += spd;

  // Recycle tiles, barriers, and dashes
  for (let i = 0; i < TILE_COUNT; i++) {
    tiles[i].position.z += spd;
    if (tiles[i].position.z > TILE_LEN * 1.5) {
      tiles[i].position.z -= TILE_COUNT * TILE_LEN;
    }

    dashGroups[i].position.z += spd;
    if (dashGroups[i].position.z > TILE_LEN * 1.5) {
      dashGroups[i].position.z -= TILE_COUNT * TILE_LEN;
    }
  }

  for (const seg of barrierSegments) {
    seg.position.z += spd;
    if (seg.position.z > TILE_LEN * 1.5) {
      seg.position.z -= TILE_COUNT * TILE_LEN;
    }
  }

  // Move grass to keep it centered
  grass.position.z += spd;
  if (grass.position.z > TILE_LEN) {
    grass.position.z -= TILE_LEN;
  }

  // Update obstacles and coins
  updateObstacles(dt);
  updateCoins(time);

  // Smooth player lane transition
  const targetX = LANE_XS[player.lane];
  player.x += (targetX - player.x) * PLAYER_LERP;
  playerGroup.position.x = player.x;

  // Tilt when moving lanes
  const targetTilt = (targetX - player.x) * -0.3;
  player.tilt += (targetTilt - player.tilt) * TILT_LERP;
  playerGroup.rotation.z = THREE.MathUtils.clamp(player.tilt, -MAX_TILT, MAX_TILT);

  // ── Jump physics ──────────────────────────────────────────────────────
  if (player.state === 'onTrain') {
    // Locked on train roof — no gravity
    player.jumpY  = TRAIN_TOP_Y;
    player.jumpVY = 0;
  } else if (player.state === 'jumping') {
    player.jumpY  += player.jumpVY;
    player.jumpVY -= GRAVITY;
    if (player.jumpY <= 0) {
      player.jumpY  = 0;
      player.jumpVY = 0;
      player.state  = 'running';
    }
  }

  // ── Roll timer ────────────────────────────────────────────────────────
  if (player.state === 'rolling') {
    player.rollTimer -= dt;
    if (player.rollTimer <= 0) {
      player.state     = 'running';
      player.rollTimer = 0;
    }
  }

  // ── Player shape based on state ──────────────────────────────────────
  if (player.state === 'rolling') {
    playerGroup.scale.set(1.3, 0.45, 1.3);
  } else {
    playerGroup.scale.set(1, 1, 1);
  }

  // ── Run bob animation ─────────────────────────────────────────────────
  const bobFreq = 12;
  const bobAmp  = 0.08;
  const groundY = (player.state === 'rolling' || player.state === 'onTrain') ? 0
                : Math.abs(Math.sin(time * bobFreq)) * bobAmp;
  playerGroup.position.y = player.jumpY + groundY;

  // Lean forward when jumping
  const targetPitch = player.state === 'jumping' ? -0.25 : 0;
  playerGroup.rotation.x += (targetPitch - playerGroup.rotation.x) * 0.12;

  // Leg animation
  const legSwing = player.state === 'rolling' ? 0 : Math.sin(time * bobFreq) * 0.3;
  leftLeg.rotation.x  =  legSwing;
  rightLeg.rotation.x = -legSwing;

  // Camera rises with player during jump
  const camTargetY = 7 + player.jumpY * 0.4;
  camera.position.y += (camTargetY - camera.position.y) * 0.1;
  camera.position.x += (player.x - camera.position.x) * 0.06;

  // Move sun shadow with camera
  sun.position.x = camera.position.x + 10;
  sun.target.position.set(camera.position.x, 0, -10);
  sun.target.updateMatrixWorld();

  // HUD
  updateHUD();

  renderer.render(scene, camera);
}

animate();
