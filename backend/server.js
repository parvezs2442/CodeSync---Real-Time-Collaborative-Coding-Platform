
import express from "express";
import { createServer } from "http";
import cors from "cors";
import { Server } from "socket.io";
import { YSocketIO } from "y-socket.io/dist/server";

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

// Socket.IO server setup with CORS
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Initialize YSocketIO
const ySocketIO = new YSocketIO(io);
ySocketIO.initialize();

// Active rooms registry
const activeRooms = new Map();

// Helper to generate room ID on server if needed
function generateUniqueRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "CS-";
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// API Routes
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "CodeSync Collaboration Server is running",
    activeRoomsCount: activeRooms.size,
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    activeRoomsCount: activeRooms.size,
  });
});

// Create Room Endpoint
app.post("/api/rooms/create", (req, res) => {
  try {
    let { roomId, username } = req.body || {};
    if (!roomId) {
      roomId = generateUniqueRoomId();
    }
    const cleanRoomId = roomId.trim().toUpperCase();

    activeRooms.set(cleanRoomId, {
      createdAt: Date.now(),
      createdBy: username ? username.trim() : "Anonymous",
    });

    console.log(`[CodeSync] Room created: ${cleanRoomId} by ${username || "Anonymous"}`);
    return res.status(201).json({
      success: true,
      roomId: cleanRoomId,
    });
  } catch (err) {
    console.error("[CodeSync] Error creating room:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create room",
    });
  }
});

// Validate Room Endpoint
app.get("/api/rooms/validate/:roomId", (req, res) => {
  try {
    const rawId = req.params.roomId;
    if (!rawId) {
      return res.status(400).json({ exists: false, message: "Room ID is required" });
    }

    const cleanRoomId = rawId.trim().toUpperCase();
    const exists = activeRooms.has(cleanRoomId) || (ySocketIO.documents && ySocketIO.documents.has(cleanRoomId));

    return res.status(200).json({
      exists: Boolean(exists),
      roomId: cleanRoomId,
    });
  } catch (err) {
    console.error("[CodeSync] Error validating room:", err);
    return res.status(500).json({
      exists: false,
      message: "Server error validating room",
    });
  }
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`[CodeSync] Server running at http://localhost:${PORT}`);
});