import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const video = document.getElementById("cam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const status = document.getElementById("status");

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
    ctx.arc(x, y, 5, 0, Math.PI * 2);
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
