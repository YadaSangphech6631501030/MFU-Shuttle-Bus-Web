const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { MONGO_URI, DB_NAME, SAVE_INTERVAL } = require("../config");

const backendRoot = path.resolve(__dirname, "..");
const frameDir = path.join(backendRoot, "runtime", "frames");
const modelPath = path.join(backendRoot, "python", "yolov8s.pt");
const processes = new Map();

function getPythonCommand() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  return process.platform === "win32" ? "python" : "python3";
}

function assertDetectorRuntime(pythonCommand) {
  if (process.env.DETECTOR_ENABLED === "false") {
    throw new Error("Detector runtime is not installed in this Docker image. Rebuild backend with INSTALL_DETECTOR=true to use CCTV/YOLO detection.");
  }

  if ((pythonCommand.includes("/") || pythonCommand.includes("\\")) && !fs.existsSync(pythonCommand)) {
    throw new Error(`Python runtime not found at ${pythonCommand}`);
  }
}

function isRunning(stationId) {
  const item = processes.get(stationId);
  return Boolean(item && item.process.exitCode === null && !item.process.killed);
}

function getFramePath(stationId) {
  return path.join(frameDir, `${stationId}.jpg`);
}

function startDetector({ stationId, cameraUrl, detectionRoi = [] }) {
  if (!stationId || !cameraUrl) {
    throw new Error("stationId and cameraUrl are required");
  }

  if (isRunning(stationId)) {
    return getDetectorStatus(stationId);
  }

  fs.mkdirSync(frameDir, { recursive: true });
  const pythonCommand = getPythonCommand();
  assertDetectorRuntime(pythonCommand);

  const child = spawn(
    pythonCommand,
    [
      path.join("python", "detector.py"),
      "--station-id",
      stationId,
      "--camera-url",
      cameraUrl,
      "--mongo-uri",
      MONGO_URI,
      "--db-name",
      DB_NAME,
      "--model",
      modelPath,
      "--frame-dir",
      frameDir,
      "--save-interval",
      String(SAVE_INTERVAL || 5),
      "--roi",
      JSON.stringify(detectionRoi),
    ],
    {
      cwd: backendRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  const state = {
    stationId,
    cameraUrl,
    process: child,
    startedAt: new Date(),
    lastLog: "",
    lastError: "",
  };

  child.stdout.on("data", (data) => {
    state.lastLog = data.toString().trim();
    console.log(`YOLO ${stationId}: ${state.lastLog}`);
  });

  child.stderr.on("data", (data) => {
    state.lastError = data.toString().trim();
    console.error(`YOLO ${stationId} ERROR: ${state.lastError}`);
  });

  child.on("exit", (code, signal) => {
    state.exitedAt = new Date();
    state.exitCode = code;
    state.signal = signal;
    console.log(`YOLO ${stationId} stopped code=${code} signal=${signal}`);
  });

  processes.set(stationId, state);
  return getDetectorStatus(stationId);
}

function stopDetector(stationId) {
  const state = processes.get(stationId);
  if (!state) return getDetectorStatus(stationId);

  if (isRunning(stationId)) {
    state.process.kill();
  }

  processes.delete(stationId);
  return getDetectorStatus(stationId);
}

function getDetectorStatus(stationId) {
  const state = processes.get(stationId);
  const framePath = getFramePath(stationId);

  return {
    stationId,
    running: isRunning(stationId),
    startedAt: state?.startedAt,
    exitedAt: state?.exitedAt,
    exitCode: state?.exitCode,
    signal: state?.signal,
    lastLog: state?.lastLog || "",
    lastError: state?.lastError || "",
    hasFrame: fs.existsSync(framePath),
  };
}

module.exports = {
  startDetector,
  stopDetector,
  getDetectorStatus,
  getFramePath,
};
