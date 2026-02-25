import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const video = document.getElementById("cam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const status = document.getElementById("status");
const modeEl = document.getElementById("mode");

// Tracking modes: "finger" | "full" | "open"
let trackingMode = "full";

// Colors per hand
const HAND_COLORS = {
  Left:  { dot: "#3b82f6", line: "rgba(59,130,246,0.5)" },  // blue
  Right: { dot: "#22c55e", line: "rgba(34,197,94,0.5)" },   // green
};

// MediaPipe hand skeleton connections (pairs of landmark indices)
const HAND_CONNECTIONS = [
  // Wrist to thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Wrist to index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Wrist to middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Wrist to ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Wrist to pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm cross
  [5, 9], [9, 13], [13, 17],
];

let handLandmarker = null;
let animFrameId = null;
let lastVideoTime = -1;

// Swipe detection
const SWIPE_THRESHOLD = 0.15;  // normalized units (0–1) over the time window
const SWIPE_TIME_WINDOW = 250; // ms — how far back to look
const COOLDOWN_MS = 600;       // ms — silence after a swipe fires

const swipeState = {
  history: [],    // [{ x, y, t }] — recent wrist positions
  cooldown: false,
};

function isIndexFingerExtended(landmarks) {
  const wrist = landmarks[0];
  const mcp   = landmarks[5];
  const tip   = landmarks[8];
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  return dist2(tip, wrist) > dist2(mcp, wrist) * 1.8;
}

function getOpenHandCenter(landmarks) {
  const tips = [landmarks[4], landmarks[8], landmarks[12], landmarks[16], landmarks[20]];
  return {
    x: tips.reduce((s, p) => s + p.x, 0) / tips.length,
    y: tips.reduce((s, p) => s + p.y, 0) / tips.length,
  };
}

function isHandOpen(landmarks) {
  const tips = [landmarks[4], landmarks[8], landmarks[12], landmarks[16], landmarks[20]];
  const xs = tips.map(p => p.x);
  return Math.max(...xs) - Math.min(...xs) > 0.12;
}

function detectSwipe(landmarks) {
  let pt;
  if (trackingMode === "finger") {
    if (!isIndexFingerExtended(landmarks)) { swipeState.history = []; return; }
    pt = { x: landmarks[8].x, y: landmarks[8].y };
  } else if (trackingMode === "full") {
    pt = { x: landmarks[0].x, y: landmarks[0].y };
  } else {  // open
    if (!isHandOpen(landmarks)) { swipeState.history = []; return; }
    pt = getOpenHandCenter(landmarks);
  }

  const threshold  = trackingMode === "open" ? 0.10 : SWIPE_THRESHOLD;
  const timeWindow = trackingMode === "open" ? 350  : SWIPE_TIME_WINDOW;

  const now = Date.now();
  swipeState.history.push({ ...pt, t: now });
  swipeState.history = swipeState.history.filter(e => now - e.t <= timeWindow);

  if (swipeState.cooldown || swipeState.history.length < 2) return;

  const oldest = swipeState.history[0];
  const current = swipeState.history[swipeState.history.length - 1];
  const dx = current.x - oldest.x;
  const dy = current.y - oldest.y;

  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;

  // Mirror correction: video/canvas are scaleX(-1), so x-axis is inverted
  const direction = Math.abs(dx) > Math.abs(dy)
    ? (dx < 0 ? "right" : "left")
    : (dy < 0 ? "up" : "down");

  console.log("Swiped " + direction);
  globalThis.dispatchEvent(new CustomEvent("swipe", { detail: direction }));
  swipeState.cooldown = true;
  swipeState.history = [];
  setTimeout(() => { swipeState.cooldown = false; }, COOLDOWN_MS);
}

function setMode(mode) {
  trackingMode = mode;
  swipeState.history = [];
  modeEl.textContent = "Mode: " + mode;
}

window.addEventListener("keydown", (e) => {
  if (e.key === "1") setMode("finger");
  else if (e.key === "2") setMode("full");
  else if (e.key === "3") setMode("open");
});

async function init() {
  status.textContent = "Loading MediaPipe...";

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
  });

  status.textContent = "Requesting camera...";
  await startCamera();
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    video.addEventListener("loadeddata", () => {
      syncCanvasSize();
      status.textContent = "Tracking...";
      loop();
    });
  } catch (err) {
    status.textContent = `Camera error: ${err.message}`;
    console.error(err);
  }
}

function syncCanvasSize() {
  // Match canvas resolution to its CSS display size so landmark
  // coordinates map 1:1 with what the user actually sees.
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}

function loop() {
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;

    const result = handLandmarker.detectForVideo(video, Date.now());
    render(result);
  }
  animFrameId = requestAnimationFrame(loop);
}

function render(result) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!result.landmarks || result.landmarks.length === 0) return;

  result.landmarks.forEach((landmarks, i) => {
    const handedness = result.handedness?.[i]?.[0]?.categoryName ?? "Right";
    const colors = HAND_COLORS[handedness] ?? HAND_COLORS.Right;

    drawConnections(landmarks, colors.line);
    drawDots(landmarks, colors.dot);
    detectSwipe(landmarks);
  });
}

function drawConnections(landmarks, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";

  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    ctx.beginPath();
    ctx.moveTo(pa.x * canvas.width, pa.y * canvas.height);
    ctx.lineTo(pb.x * canvas.width, pb.y * canvas.height);
    ctx.stroke();
  }
}

function drawDots(landmarks, color) {
  for (const lm of landmarks) {
    const x = lm.x * canvas.width;
    const y = lm.y * canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

init().catch((err) => {
  status.textContent = `Init error: ${err.message}`;
  console.error(err);
});
