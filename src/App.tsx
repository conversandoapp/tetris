import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, Hand, Gamepad2 } from 'lucide-react';

// --- TETRIS CONSTANTS ---
const COLS = 12;
const ROWS = 20;
const BLOCK_SIZE = 30;

const PIECES = {
  I: [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]],
  L: [[0, 2, 0], [0, 2, 0], [0, 2, 2]],
  J: [[0, 3, 0], [0, 3, 0], [3, 3, 0]],
  O: [[4, 4], [4, 4]],
  Z: [[5, 5, 0], [0, 5, 5], [0, 0, 0]],
  S: [[0, 6, 6], [6, 6, 0], [0, 0, 0]],
  T: [[0, 7, 0], [7, 7, 7], [0, 0, 0]],
};

const COLORS = [
  '#FF3D00', // red
  '#2979FF', // blue
  '#00E676', // green
  '#FFEA00', // yellow
  '#D500F9', // purple
  '#FF9100', // orange
  '#00E5FF', // cyan
];

type Matrix = number[][];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [handX, setHandX] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const gameStartedRef = useRef(false);
  const gameOverRef = useRef(false);
  const handXRef = useRef<number | null>(null);

  // Sync refs with state for the loop
  useEffect(() => {
    gameStartedRef.current = gameStarted;
    gameOverRef.current = gameOver;
  }, [gameStarted, gameOver]);

  useEffect(() => {
    handXRef.current = handX;
  }, [handX]);

  // Game State Refs (to avoid closure issues in loops)
  const arenaRef = useRef<Matrix>(Array.from({ length: ROWS }, () => Array(COLS).fill(0)));
  const playerRef = useRef({
    pos: { x: 5, y: 0 },
    matrix: PIECES.T as Matrix,
  });
  const dropCounterRef = useRef(0);
  const lastTimeRef = useRef(0);

  // --- TETRIS LOGIC ---

  const createPiece = (type: keyof typeof PIECES): Matrix => PIECES[type];

  const playerReset = useCallback(() => {
    const keys = Object.keys(PIECES) as (keyof typeof PIECES)[];
    const type = keys[(keys.length * Math.random()) | 0];
    playerRef.current.matrix = createPiece(type);
    playerRef.current.pos.y = 0;
    playerRef.current.pos.x = Math.floor(COLS / 2) - Math.floor(playerRef.current.matrix[0].length / 2);

    if (collide(arenaRef.current, playerRef.current)) {
      setGameOver(true);
      setGameStarted(false);
    }
  }, []);

  const collide = (arena: Matrix, player: typeof playerRef.current) => {
    const [m, o] = [player.matrix, player.pos];
    for (let y = 0; y < m.length; ++y) {
      for (let x = 0; x < m[y].length; ++x) {
        if (
          m[y][x] !== 0 &&
          (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const merge = (arena: Matrix, player: typeof playerRef.current) => {
    player.matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          arena[y + player.pos.y][x + player.pos.x] = value;
        }
      });
    });
  };

  const arenaSweep = useCallback(() => {
    let rowCount = 1;
    const arena = arenaRef.current;
    outer: for (let y = arena.length - 1; y > 0; --y) {
      for (let x = 0; x < arena[y].length; ++x) {
        if (arena[y][x] === 0) {
          continue outer;
        }
      }
      const row = arena.splice(y, 1)[0].fill(0);
      arena.unshift(row);
      ++y;
      setScore((prev) => prev + rowCount * 10);
      rowCount *= 2;
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    // Clear
    context.fillStyle = '#111';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Arena
    drawMatrix(context, arenaRef.current, { x: 0, y: 0 });
    // Draw Player
    drawMatrix(context, playerRef.current.matrix, playerRef.current.pos);

    // Draw Ghost Hand Indicator
    if (handXRef.current !== null) {
      context.fillStyle = 'rgba(255, 255, 255, 0.1)';
      context.fillRect(handXRef.current * BLOCK_SIZE, 0, BLOCK_SIZE, canvas.height);
    }
  }, []);

  const drawMatrix = (ctx: CanvasRenderingContext2D, matrix: Matrix, offset: { x: number; y: number }) => {
    matrix.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value !== 0) {
          ctx.fillStyle = COLORS[value - 1];
          ctx.fillRect((x + offset.x) * BLOCK_SIZE, (y + offset.y) * BLOCK_SIZE, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
          
          // Glossy effect
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.fillRect((x + offset.x) * BLOCK_SIZE, (y + offset.y) * BLOCK_SIZE, BLOCK_SIZE - 1, (BLOCK_SIZE - 1) / 3);
        }
      });
    });
  };

  const update = useCallback((time = 0) => {
    if (!gameStartedRef.current || gameOverRef.current) return;

    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;
    dropCounterRef.current += deltaTime;

    if (dropCounterRef.current > 1000) {
      playerRef.current.pos.y++;
      if (collide(arenaRef.current, playerRef.current)) {
        playerRef.current.pos.y--;
        merge(arenaRef.current, playerRef.current);
        playerReset();
        arenaSweep();
      }
      dropCounterRef.current = 0;
    }

    draw();
    requestAnimationFrame(update);
  }, [playerReset, arenaSweep, draw]);

  const requestCameraPermission = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Stop the stream immediately, we just wanted the permission
      stream.getTracks().forEach(track => track.stop());
      setIsCameraReady(true);
      // The useEffect will handle starting the MediaPipe camera now that we have permission
    } catch (err: any) {
      console.error("Manual camera request error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Permiso denegado. Haz clic en el icono de la cámara en la barra de direcciones y selecciona "Permitir".');
      } else {
        setCameraError('No se pudo acceder a la cámara. Asegúrate de que no esté en uso.');
      }
    }
  };

  useEffect(() => {
    // Check if permission was already granted
    navigator.permissions?.query({ name: 'camera' as PermissionName }).then((result) => {
      if (result.state === 'granted') {
        setIsCameraReady(true);
      }
    }).catch(() => {
      // Fallback if permissions API is not supported
    });
  }, []);

  // --- HAND TRACKING ---

  useEffect(() => {
    if (!videoRef.current || !isCameraReady) return;

    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    hands.onResults((results: Results) => {
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const hand = results.multiHandLandmarks[0];
        // Landmark 9 is the middle finger base, stable for tracking
        const x = hand[9].x;
        
        // Invert X because camera is mirrored
        const mirroredX = 1 - x;
        const targetX = Math.floor(mirroredX * COLS);
        
        setHandX(targetX);

        if (gameStarted && !gameOver) {
          const oldX = playerRef.current.pos.x;
          const matrixWidth = playerRef.current.matrix[0].length;
          
          // Clamp X
          const clampedX = Math.max(0, Math.min(targetX, COLS - matrixWidth));
          playerRef.current.pos.x = clampedX;

          if (collide(arenaRef.current, playerRef.current)) {
            playerRef.current.pos.x = oldX;
          }
        }
      } else {
        setHandX(null);
      }
    });

    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) {
          await hands.send({ image: videoRef.current });
        }
      },
      width: 320,
      height: 240,
    });

    camera.start().catch((err) => {
      console.error("Camera start error:", err);
      setCameraError('Error al iniciar la cámara. Intenta recargar la página.');
    });

    return () => {
      camera.stop();
      hands.close();
    };
  }, [gameStarted, gameOver, isCameraReady]);

  const startGame = () => {
    arenaRef.current = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    setScore(0);
    setGameOver(false);
    setGameStarted(true);
    playerReset();
    lastTimeRef.current = performance.now();
    requestAnimationFrame(update);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-bold tracking-tighter bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
          TETRIS MOTION
        </h1>
        <div className="flex items-center justify-center gap-4 text-zinc-400 text-sm font-mono uppercase tracking-widest">
          <div className="flex items-center gap-1">
            <Hand size={14} /> Tracking Activo
          </div>
          <div className="w-1 h-1 rounded-full bg-zinc-700" />
          <div className="flex items-center gap-1">
            <Trophy size={14} /> Score: {score}
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Game Board */}
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
          <canvas
            ref={canvasRef}
            width={COLS * BLOCK_SIZE}
            height={ROWS * BLOCK_SIZE}
            className="relative bg-zinc-900 rounded-lg border border-zinc-800 shadow-2xl"
          />

          <AnimatePresence>
            {!gameStarted && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-lg backdrop-blur-sm p-6 text-center"
              >
                {gameOver ? (
                  <>
                    <RotateCcw size={48} className="text-red-400 mb-4" />
                    <h2 className="text-3xl font-bold mb-2">Game Over</h2>
                    <p className="text-zinc-400 mb-6">Puntuación final: {score}</p>
                  </>
                ) : (
                  <>
                    <Gamepad2 size={48} className="text-blue-400 mb-4" />
                    <h2 className="text-3xl font-bold mb-2">¿Listo?</h2>
                    <p className="text-zinc-400 mb-6">Usa tu mano para mover las piezas</p>
                  </>
                )}
                <button
                  onClick={startGame}
                  className="flex items-center gap-2 px-8 py-3 bg-white text-black rounded-full font-bold hover:bg-blue-400 hover:text-white transition-all active:scale-95"
                >
                  <Play size={20} fill="currentColor" />
                  {gameOver ? 'REINTENTAR' : 'EMPEZAR'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Camera Feed & Controls */}
        <div className="flex flex-col gap-6 w-full lg:w-80">
          <div className="relative rounded-2xl overflow-hidden border-2 border-zinc-800 bg-zinc-900 shadow-xl aspect-video">
            <video
              ref={videoRef}
              className="w-full h-full object-cover -scale-x-100"
              autoPlay
              playsInline
              muted
            />
            
            <AnimatePresence>
              {!isCameraReady && !cameraError && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-4 text-center z-20 backdrop-blur-sm"
                >
                  <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center mb-3">
                    <Hand size={24} className="text-blue-500" />
                  </div>
                  <p className="text-xs text-zinc-300 font-medium mb-4">
                    Se requiere acceso a la cámara para jugar
                  </p>
                  <button 
                    onClick={requestCameraPermission}
                    className="px-6 py-2 bg-blue-500 text-white rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-blue-400 transition-colors"
                  >
                    Habilitar Cámara
                  </button>
                </motion.div>
              )}

              {cameraError && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-4 text-center z-20"
                >
                  <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-3">
                    <Hand size={24} className="text-red-500" />
                  </div>
                  <p className="text-xs text-zinc-300 font-medium leading-relaxed">
                    {cameraError}
                  </p>
                  <button 
                    onClick={() => window.location.reload()}
                    className="mt-4 text-[10px] uppercase tracking-widest font-bold text-zinc-500 hover:text-white transition-colors"
                  >
                    Recargar Página
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="absolute top-3 left-3 px-2 py-1 bg-black/50 backdrop-blur-md rounded-md text-[10px] font-bold text-emerald-400 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE CAMERA
            </div>
            
            {/* Hand Position Indicator Overlay */}
            {handX !== null && (
              <div 
                className="absolute bottom-0 h-1 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-75"
                style={{ 
                  left: `${(handX / COLS) * 100}%`, 
                  width: `${(1 / COLS) * 100}%` 
                }}
              />
            )}
          </div>

          <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 space-y-4">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Instrucciones</h3>
            <ul className="space-y-3 text-sm text-zinc-300">
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 shrink-0">1</div>
                Mueve tu mano frente a la cámara para desplazar la pieza lateralmente.
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 shrink-0">2</div>
                La pieza caerá automáticamente cada segundo.
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-500 shrink-0">3</div>
                ¡Evita que las piezas lleguen al techo!
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
