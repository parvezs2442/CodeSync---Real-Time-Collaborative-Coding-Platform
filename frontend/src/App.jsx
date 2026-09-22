import React, { useState, useEffect, useRef, useMemo } from "react";
import Editor from "@monaco-editor/react";
import * as Y from "yjs";
import { SocketIOProvider } from "y-socket.io";
import { MonacoBinding } from "y-monaco";

// Curated avatar & cursor colors
const USER_COLORS = [
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#14b8a6", // Teal
];

function getRandomColor() {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "CS-";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const SUPPORTED_LANGUAGES = [
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "cpp", label: "C++" },
  { id: "java", label: "Java" },
  { id: "json", label: "JSON" },
  { id: "markdown", label: "Markdown" },
];

export default function App() {
  // Query parameters
  const params = new URLSearchParams(window.location.search);
  const initialRoom = params.get("room") || "";
  const initialUser = params.get("username") || "";

  // Lobby state
  const [username, setUsername] = useState(initialUser);
  const [roomIdInput, setRoomIdInput] = useState(initialRoom);
  const [activeTab, setActiveTab] = useState(initialRoom ? "join" : "create");
  const [createdRoomInfo, setCreatedRoomInfo] = useState(null); // { roomId, username }
  const [error, setError] = useState("");
  const [copyToast, setCopyToast] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Active Session state (start false so even URLs get validated)
  const [activeRoomId, setActiveRoomId] = useState("");
  const [activeUser, setActiveUser] = useState("");
  const [isInRoom, setIsInRoom] = useState(false);

  // Editor and Collaboration state
  const [editorInstance, setEditorInstance] = useState(null);
  const [monacoInstance, setMonacoInstance] = useState(null);
  const [users, setUsers] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [language, setLanguage] = useState("javascript");
  const [theme, setTheme] = useState("vs-dark");

  const userColor = useMemo(() => getRandomColor(), []);

  // Toast feedback timeout
  useEffect(() => {
    if (!copyToast) return;
    const timer = setTimeout(() => setCopyToast(""), 3000);
    return () => clearTimeout(timer);
  }, [copyToast]);

  // Handle Create Room (registers with backend)
  const handleCreateRoom = async (e) => {
    e?.preventDefault();
    const name = username.trim();
    if (!name) {
      setError("Please enter your name to create a room.");
      return;
    }
    setError("");
    setIsProcessing(true);

    const newRoomId = generateRoomId();

    try {
      const backendHost = window.location.hostname || "localhost";
      const res = await fetch(`http://${backendHost}:3000/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: newRoomId, username: name }),
      });

      if (!res.ok) {
        throw new Error("Failed to register room on server");
      }

      const data = await res.json();
      setCreatedRoomInfo({ roomId: data.roomId || newRoomId, username: name });
    } catch (err) {
      console.error(err);
      setError("Could not connect to collaboration server. Please ensure backend server is running.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Enter room after validation or creation
  const enterRoom = (room, user) => {
    const trimmedRoom = room.trim().toUpperCase();
    const trimmedUser = user.trim();
    if (!trimmedRoom || !trimmedUser) return;

    setActiveRoomId(trimmedRoom);
    setActiveUser(trimmedUser);
    setIsInRoom(true);
    setCreatedRoomInfo(null);
    setError("");

    // Update URL query params without full page reload
    const newUrl = `${window.location.pathname}?room=${trimmedRoom}&username=${encodeURIComponent(
      trimmedUser
    )}`;
    window.history.pushState({}, "", newUrl);
  };

  // Handle Join Room (validates room existence first)
  const handleJoinRoom = async (e) => {
    e?.preventDefault();
    const name = username.trim();
    const room = roomIdInput.trim().toUpperCase();

    if (!name) {
      setError("Please enter your name.");
      return;
    }
    if (!room) {
      setError("Please enter a valid Room ID to join.");
      return;
    }
    setError("");
    setIsProcessing(true);

    try {
      const backendHost = window.location.hostname || "localhost";
      const res = await fetch(`http://${backendHost}:3000/api/rooms/validate/${encodeURIComponent(room)}`);

      if (!res.ok) {
        throw new Error("Failed to reach server");
      }

      const data = await res.json();
      if (!data.exists) {
        setError(`Room "${room}" does not exist! Please check the ID or create a new room.`);
        return;
      }

      enterRoom(room, name);
    } catch (err) {
      console.error(err);
      setError("Could not connect to collaboration server. Please check your network or server status.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Leave Room
  const handleLeaveRoom = () => {
    setIsInRoom(false);
    setActiveRoomId("");
    setEditorInstance(null);
    setMonacoInstance(null);
    setUsers([]);
    setConnectionStatus("disconnected");
    setCreatedRoomInfo(null);
    window.history.pushState({}, "", window.location.pathname);
  };

  // Copy helper
  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyToast(`${label} copied to clipboard!`);
    } catch {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopyToast(`${label} copied!`);
    }
  };

  // Monaco Editor mount callback
  const handleEditorDidMount = (editor, monaco) => {
    setEditorInstance(editor);
    setMonacoInstance(monaco);
  };

  // Change language dynamically in Monaco
  const handleLanguageChange = (newLang) => {
    setLanguage(newLang);
    if (editorInstance && monacoInstance) {
      const model = editorInstance.getModel();
      if (model) {
        monacoInstance.editor.setModelLanguage(model, newLang);
      }
    }
  };

  // Real-time synchronization effect
  useEffect(() => {
    if (!isInRoom || !activeRoomId || !activeUser || !editorInstance) {
      return;
    }

    console.log(`[CodeSync] Connecting to room: ${activeRoomId} as ${activeUser}`);
    setConnectionStatus("connecting");

    // Fresh Y.Doc for this session
    const ydoc = new Y.Doc();
    const yText = ydoc.getText("monaco");

    // Dynamic backend host (localhost or network IP)
    const backendHost = window.location.hostname || "localhost";
    const serverUrl = `http://${backendHost}:3000`;

    const provider = new SocketIOProvider(serverUrl, activeRoomId, ydoc, {
      autoConnect: true,
    });

    // Register user awareness
    provider.awareness.setLocalStateField("user", {
      username: activeUser,
      color: userColor,
    });

    // Listen for awareness updates (online users)
    const updateUsers = () => {
      const states = Array.from(provider.awareness.getStates().entries());
      const onlineUsers = states
        .filter(([, state]) => state.user && state.user.username)
        .map(([clientId, state]) => ({
          clientId,
          username: state.user.username,
          color: state.user.color || "#3b82f6",
          isSelf: clientId === ydoc.clientID,
        }));

      setUsers(onlineUsers);
    };

    updateUsers();
    provider.awareness.on("change", updateUsers);

    // Connection status listeners
    provider.on("status", (events) => {
      const status = events?.[0]?.status;
      if (status) {
        setConnectionStatus(status);
      }
    });

    provider.on("synced", (isSynced) => {
      if (isSynced) {
        setConnectionStatus("connected");

        // If doc is completely new/empty, provide friendly starter code
        if (yText.length === 0) {
          const starterCode = `// Welcome to CodeSync - Real-Time Collaborative Workspace
// Room ID: ${activeRoomId}
// Collaborator: ${activeUser}

function greet() {
  console.log("Welcome to real-time coding with CodeSync!");
}

greet();
`;
          yText.insert(0, starterCode);
        }
      }
    });

    provider.on("connection-error", () => {
      setConnectionStatus("disconnected");
    });

    // Bind Monaco editor with Yjs doc
    const monacoBinding = new MonacoBinding(
      yText,
      editorInstance.getModel(),
      new Set([editorInstance]),
      provider.awareness
    );

    // Cleanup on unmount or when leaving room
    return () => {
      console.log(`[CodeSync] Cleaning up room: ${activeRoomId}`);
      provider.awareness.off("change", updateUsers);
      provider.awareness.setLocalStateField("user", null);
      monacoBinding.destroy();
      provider.destroy();
      ydoc.destroy();
    };
  }, [isInRoom, activeRoomId, activeUser, editorInstance, userColor]);

  // Render Lobby (Create or Join Room)
  if (!isInRoom) {
    const inviteUrl = createdRoomInfo
      ? `${window.location.origin}${window.location.pathname}?room=${createdRoomInfo.roomId}`
      : "";

    return (
      <main className="min-h-screen w-full bg-[#080d1a] flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Glowing gradient background accents */}
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-cyan-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Copy Notification Toast */}
        {copyToast && (
          <div className="fixed top-6 z-50 px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg shadow-xl shadow-emerald-500/20 flex items-center gap-2 animate-bounce">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {copyToast}
          </div>
        )}

        <div className="w-full max-w-md z-10">
          {/* Header Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-500 shadow-lg shadow-indigo-500/25 mb-4">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">CodeSync</h1>
            <p className="text-gray-400 text-sm mt-1">Real-Time Collaborative Coding Workspace</p>
          </div>

          {/* Main Card */}
          <div className="bg-[#111827]/90 border border-gray-800 backdrop-blur-xl rounded-2xl shadow-2xl p-6 md:p-8">
            {/* Modal / View when room has just been created */}
            {createdRoomInfo ? (
              <div className="space-y-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 mb-1">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>

                <div>
                  <h2 className="text-xl font-bold text-white">Room Created!</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Share this unique Room ID with your team to code together.
                  </p>
                </div>

                {/* Unique Room ID Display */}
                <div className="bg-[#1e293b] border border-gray-700/80 rounded-xl p-4 flex flex-col items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Your Room ID</span>
                  <div className="text-3xl font-mono font-extrabold tracking-widest text-indigo-400">
                    {createdRoomInfo.roomId}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(createdRoomInfo.roomId, "Room ID")}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium text-gray-200 border border-gray-700 transition"
                  >
                    <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy ID
                  </button>

                  <button
                    type="button"
                    onClick={() => copyToClipboard(inviteUrl, "Invite Link")}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium text-gray-200 border border-gray-700 transition"
                  >
                    <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Copy Link
                  </button>
                </div>

                {/* Enter Room button */}
                <button
                  type="button"
                  onClick={() => enterRoom(createdRoomInfo.roomId, createdRoomInfo.username)}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-semibold text-base shadow-lg shadow-indigo-600/30 transition duration-200 flex items-center justify-center gap-2"
                >
                  Enter Room Now
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => setCreatedRoomInfo(null)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition"
                >
                  ← Back to Menu
                </button>
              </div>
            ) : (
              <div>
                {/* Tabs: Create Room / Join Room */}
                <div className="grid grid-cols-2 p-1 bg-gray-900/90 rounded-xl mb-6 border border-gray-800">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("create");
                      setError("");
                    }}
                    className={`py-2 text-sm font-medium rounded-lg transition-all ${
                      activeTab === "create"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    Create Room
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("join");
                      setError("");
                    }}
                    className={`py-2 text-sm font-medium rounded-lg transition-all ${
                      activeTab === "join"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    Join Room
                  </button>
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{error}</span>
                  </div>
                )}

                {/* TAB 1: CREATE ROOM */}
                {activeTab === "create" && (
                  <form onSubmit={handleCreateRoom} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                        Your Name / Username
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Parvez"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                      />
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isProcessing}
                        className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 text-white font-semibold text-sm shadow-lg shadow-indigo-600/25 transition duration-200 flex items-center justify-center gap-2"
                      >
                        {isProcessing ? (
                          <span>Generating Room...</span>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Create Room & Generate ID
                          </>
                        )}
                      </button>
                    </div>

                    <p className="text-center text-xs text-gray-500 mt-2">
                      Creates a private workspace and gives you a shareable Room ID.
                    </p>
                  </form>
                )}

                {/* TAB 2: JOIN ROOM */}
                {activeTab === "join" && (
                  <form onSubmit={handleJoinRoom} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                        Your Name / Username
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Alex"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300 mb-1.5">
                        Room ID
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. CS-9X2K4A"
                        value={roomIdInput}
                        onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white font-mono placeholder-gray-500 uppercase focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                      />
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isProcessing}
                        className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 text-white font-semibold text-sm shadow-lg shadow-indigo-600/25 transition duration-200 flex items-center justify-center gap-2"
                      >
                        {isProcessing ? (
                          <span>Checking Room...</span>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                            </svg>
                            Join Workspace
                          </>
                        )}
                      </button>
                    </div>

                    <p className="text-center text-xs text-gray-500 mt-2">
                      Only verified, active rooms can be joined.
                    </p>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  // Render Collaborative Editor Room View
  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${activeRoomId}`;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#090d16] text-gray-200 overflow-hidden">
      {/* Toast Feedback */}
      {copyToast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg shadow-xl flex items-center gap-2 animate-fade-in">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {copyToast}
        </div>
      )}

      {/* TOP NAVIGATION BAR */}
      <header className="h-14 border-b border-gray-800 bg-[#0d1322] px-4 flex items-center justify-between shrink-0 z-20">
        {/* Left: Brand + Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-bold text-white tracking-tight text-lg">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center shadow-md">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <span>CodeSync</span>
          </div>

          <div className="h-4 w-px bg-gray-700 mx-1 hidden sm:block" />

          {/* Connection Status Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-900/80 border border-gray-800">
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === "connected"
                  ? "bg-emerald-400 animate-pulse"
                  : connectionStatus === "connecting"
                  ? "bg-amber-400 animate-ping"
                  : "bg-red-400"
              }`}
            />
            <span className="capitalize text-gray-300">{connectionStatus}</span>
          </div>
        </div>

        {/* Center: Room ID Pill with 1-click Copy */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-900 border border-gray-800 rounded-lg pl-3 pr-1 py-1">
            <span className="text-xs text-gray-400 mr-2 font-medium">Room:</span>
            <span className="font-mono text-xs font-bold text-indigo-400 tracking-wider mr-2">
              {activeRoomId}
            </span>
            <button
              onClick={() => copyToClipboard(activeRoomId, "Room ID")}
              title="Copy Room ID"
              className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={() => copyToClipboard(inviteUrl, "Invite Link")}
              title="Copy Full Invite Link"
              className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition ml-0.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </button>
          </div>
        </div>

        {/* Right: Controls & Leave */}
        <div className="flex items-center gap-3">
          {/* Language Selector */}
          <div className="hidden md:flex items-center gap-1.5">
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="bg-gray-900 border border-gray-700 text-xs rounded-lg px-2.5 py-1 text-gray-200 focus:outline-none focus:border-indigo-500 transition"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          {/* Theme Selector */}
          <div className="hidden lg:flex items-center">
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="bg-gray-900 border border-gray-700 text-xs rounded-lg px-2.5 py-1 text-gray-200 focus:outline-none focus:border-indigo-500 transition"
            >
              <option value="vs-dark">VS Dark</option>
              <option value="light">Light</option>
            </select>
          </div>

          {/* Leave Room Button */}
          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Leave
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden">
        {/* COLLABORATORS SIDEBAR */}
        <aside className="w-64 bg-[#0d1322]/90 border-r border-gray-800/80 flex flex-col justify-between shrink-0">
          <div>
            {/* Sidebar header */}
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-gray-400 font-bold">
                  Collaborators ({users.length})
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
            </div>

            {/* Users list */}
            <div className="p-3 space-y-1.5 overflow-y-auto max-h-[calc(100vh-280px)]">
              {users.map((u) => (
                <div
                  key={u.clientId}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-gray-900/60 border border-gray-800/60 hover:border-gray-700 transition"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: u.color }}
                    />
                    <span className="text-sm font-medium text-gray-200 truncate">
                      {u.username}
                    </span>
                  </div>
                  {u.isSelf && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shrink-0">
                      You
                    </span>
                  )}
                </div>
              ))}

              {users.length === 0 && (
                <div className="text-center py-6 text-xs text-gray-500">
                  Waiting for collaborators...
                </div>
              )}
            </div>
          </div>

          {/* Quick Share Card at Bottom of Sidebar */}
          <div className="p-4 border-t border-gray-800 bg-[#090e18]/80">
            <div className="text-xs text-gray-400 font-medium mb-2">Share Room</div>
            <button
              onClick={() => copyToClipboard(inviteUrl, "Invite Link")}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-semibold transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy Invite Link
            </button>
            <p className="text-[11px] text-gray-500 text-center mt-2 leading-tight">
              Anyone with this link can join and code in real time with you.
            </p>
          </div>
        </aside>

        {/* MONACO CODE EDITOR CANVAS */}
        <main className="flex-1 h-full bg-[#1e1e1e] relative">
          <Editor
            height="100%"
            language={language}
            theme={theme}
            options={{
              fontSize: 14,
              fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
              fontLigatures: true,
              minimap: { enabled: true },
              automaticLayout: true,
              tabSize: 2,
              scrollBeyondLastLine: false,
              cursorBlinking: "smooth",
              smoothScrolling: true,
              renderWhitespace: "selection",
              wordWrap: "on",
            }}
            onMount={handleEditorDidMount}
          />
        </main>
      </div>
    </div>
  );
}