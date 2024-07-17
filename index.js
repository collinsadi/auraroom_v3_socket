require("dotenv").config(); // Load environment variables from a .env file
const express = require("express"); // Import Express framework
const cors = require("cors"); // Import CORS middleware
const { createServer } = require("http"); // Import HTTP server
const { Server } = require("socket.io"); // Import Socket.io

// Import custom middlewares and helpers
const { authenticateSocket } = require("./middlewares/socketAuth");
const {
  addWebSocket,
  updateWebSocketStatus,
  getRandomIdleSocket,
  removeWebSocket,
} = require("./helpers/randomMatch");
const generateUniqueHash = require("./utils/generateHash");
const { roomModel } = require("./config/connectDB");

const app = express(); // Create an Express app
const port = process.env.PORT || 3000; // Define the port to run the server
const httpServer = createServer(app); // Create an HTTP server

// Set up Socket.io with some configurations
const io = new Server(httpServer, {
  pingInterval: 10000, // How often to send a ping
  pingTimeout: 5000, // How long to wait for a pong before closing connection
  cookie: false, // Disable cookies
  transports: ["websocket", "polling"], // Transport methods
  cors: {
    origin: "*", // Allowed origins
    methods: ["GET", "POST"], // Allowed HTTP methods
  },
});

// Serve static files from the "public" directory
app.use(express.static("public"));

// Use CORS with specific origins
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

// Use the custom socket authentication middleware
io.use(authenticateSocket);

const rooms = {}; // Object to keep track of chat rooms
const waitingQueue = []; // Array to keep track of users waiting for random match

// Helper function to add a delay (in milliseconds)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Handle new socket connections
io.on("connection", (socket) => {
  // If the socket is for the "family" room, add it to the WebSocket list
  if (socket.forFamily) {
    addWebSocket(socket.id, socket);
  }

  // When a chat room is opened
  socket.on("chat-opened", () => {
    if (socket.forFamily) return; // Skip if it's for the "family" room

    const randomName = getRandomPair(); // Generate a random name for the user
    const chatRoom = `chat-${socket.decodedRoom}`; // Define the chat room name

    socket.join(chatRoom); // Join the chat room
    socket.to(chatRoom).emit("joined", { name: randomName }); // Notify others in the room
    socket.emit("name", {
      name: randomName,
      room: socket.decodedRoomName,
      image: Math.floor(Math.random() * 10) + "",
      identifier: Math.random() + "",
    });

    // Add the socket to the room's user set
    if (!rooms[chatRoom]) rooms[chatRoom] = new Set();
    rooms[chatRoom].add(socket.id);

    // Update user count for the room
    io.to(chatRoom).emit("updateUserCount", rooms[chatRoom].size);
  });

  // Handle new messages
  socket.on("newMessage", async (data) => {
    try {
      socket.broadcast.to(`chat-${socket.decodedRoom}`).emit("newMessage", data); // Send message to others
    } catch (error) {
      console.error(error.message); // Log any errors
      socket.emit("messageError", { message: error.message }); // Notify the sender of the error
    }
  });

  // Handle "typing" event
  socket.on("typing", (data) => {
    try {
      socket.broadcast.to(`chat-${socket.decodedRoom}`).emit("typing", data); // Notify others that the user is typing
    } catch (error) {
      console.error(error.message); // Log any errors
      socket.emit("messageError", { message: error.message }); // Notify the sender of the error
    }
  });

  // Handle "stoppedTyping" event
  socket.on("stoppedTyping", (data) => {
    try {
      socket.broadcast.to(`chat-${socket.decodedRoom}`).emit("stoppedTyping", data); // Notify others that the user stopped typing
    } catch (error) {
      console.error(error.message); // Log any errors
      socket.emit("messageError", { message: error.message }); // Notify the sender of the error
    }
  });

  // Handle random matching of users
  socket.on("randomMatch", async () => {
    try {
      const Room = await roomModel(); // Get the room model

      waitingQueue.push(socket); // Add the socket to the waiting queue
      updateWebSocketStatus(socket.id, true); // Mark the socket as active

      let foundSocket;

      // Keep looking for a match until one is found
      while (waitingQueue.includes(socket)) {
        foundSocket = getRandomIdleSocket(socket); // Look for an idle socket

        if (foundSocket) {
          // Found a match, remove both sockets from the waiting queue
          updateWebSocketStatus(socket.id, false);
          updateWebSocketStatus(foundSocket.id, false);
          waitingQueue.splice(waitingQueue.indexOf(socket), 1);
          waitingQueue.splice(waitingQueue.indexOf(foundSocket), 1);
          break;
        }

        await delay(1000); // Wait a bit before checking again
      }

      // No match found, notify the user and mark the socket as inactive
      if (!foundSocket) {
        updateWebSocketStatus(socket.id, false);
        socket.emit("searchError");
        return;
      }

      // Create a new chat room for the match
      const room = await Room.insertOne({
        name: "Random Meetup",
        token: generateUniqueHash(5),
        room_id: generateUniqueHash(6),
        random: true,
      });

      // Notify both users about the match
      socket.emit("found", {
        userName: foundSocket.name,
        room: room.room_id,
        key: room.token,
      });
      foundSocket.emit("found", {
        userName: getRandomPair(),
        room: room.room_id,
        key: room.token,
      });
    } catch (error) {
      console.error("Error during random match:", error); // Log any errors
      socket.emit("searchError"); // Notify the user of the error
      updateWebSocketStatus(socket.id, false); // Mark the socket as inactive
    }
  });

  // Handle leaving a room
  socket.on("leaveRoom", () => {
    const chatRoom = `chat-${socket.decodedRoom}`;
    socket.leave(chatRoom); // Leave the chat room

    if (rooms[chatRoom]) {
      rooms[chatRoom].delete(socket.id); // Remove the user from the room
      io.to(chatRoom).emit("updateUserCount", rooms[chatRoom].size); // Update user count
    }

    socket.broadcast.to(chatRoom).emit("leave", { message: "A user left the room." }); // Notify others
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("Socket Disconnected");
    removeWebSocket(socket.id); // Remove the socket from the WebSocket list
    waitingQueue.splice(waitingQueue.indexOf(socket), 1); // Remove the socket from the waiting queue

    // Notify others about the disconnection
    socket.broadcast.to(`chat-${socket.decodedRoom}`).emit("leave", { message: "A user left the room." });

    // Clean up user from all rooms they were part of
    for (const room in rooms) {
      if (rooms[room].has(socket.id)) {
        rooms[room].delete(socket.id);
        io.to(room).emit("updateUserCount", rooms[room].size);
      }
    }
  });
});

// Start the server
httpServer.listen(port, () => {
  console.log(`Server Started on port ${port}`);
});
