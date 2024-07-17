require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 3000;
const { Server } = require("socket.io");
const { createServer } = require("http");
const httpServer = createServer(app);
const { authenticateSocket } = require("./middlewares/socketAuth");
const {
  addWebSocket,
  updateWebSocketStatus,
  getRandomIdleSocket,
  removeWebSocket,
} = require("./helpers/randomMatch");
const generateUniqueHash = require("./utils/generateHash");
const { roomModel } = require("./config/connectDB");

const io = new Server(httpServer, {
  pingInterval: 10000,
  pingTimeout: 5000,
  cookie: false,
  transports: ["websocket", "polling"],
  cors: {
    origin: ["https://auraroom.xyz", "https://room.auraroom.xyz"],
    methods: ["GET", "POST"],
  },
});
// const io = new Server(httpServer, {
//   pingInterval: 10000,
//   pingTimeout: 5000,
//   cookie: false,
//   transports: ["websocket", "polling"],
//   cors: {
//     origin: "*",
//     methods: ["GET", "POST"],
//   },
// });

app.use(express.static("public"));
app.use(
  cors({
    origin: ["https://auraroom.xyz", "https://room.auraroom.xyz"],
    methods: ["GET", "POST"],
  })
);
// app.use(
//   cors({
//     origin: "*",
//     methods: ["GET", "POST"],
//   })
// );
io.use(authenticateSocket);

// SOCKET ZONE ==========
const rooms = {};

io.on("connection", (socket) => {
  if (socket.forFamily) {
    addWebSocket(socket.id, socket);
  }

  socket.on("chat-opened", () => {
    if (socket.forFamily) {
      return;
    }
    const randomName = getRandomPair();
    socket.join("chat-" + socket.decodedRoom);
    socket
      .to("chat-" + socket.decodedRoom)
      .emit("joined", { name: randomName });
    socket.emit("name", {
      name: randomName,
      room: socket.decodedRoomName,
      image: Math.floor(Math.random() * 10) + "",
      identifier: Math.random() + "",
    });

    if (!rooms["chat-" + socket.decodedRoom]) {
      rooms["chat-" + socket.decodedRoom] = new Set();
    }
    rooms["chat-" + socket.decodedRoom].add(socket.id);

    io.to("chat-" + socket.decodedRoom).emit(
      "updateUserCount",
      rooms["chat-" + socket.decodedRoom].size
    );
  });

  // Listen for "newMessage" events
  socket.on("newMessage", async (data) => {
    try {
      // If no error is thrown, broadcast the message
      socket.broadcast
        .to("chat-" + socket.decodedRoom)
        .emit("newMessage", data);
      sendNotification(
        socket.decodedRoom,
        data.message,
        data.image,
        data.p256dh
      );
    } catch (error) {
      // Emit error message if any error occurs
      console.error(error.message);
      socket.emit("messageError", { message: error.message });
    }
  });

  // Listen for "typing" events
  socket.on("typing", (data) => {
    console.log(data);
    try {
      // Emit the message to the other sockets
      socket.broadcast.to("chat-" + socket.decodedRoom).emit("typing", data);
    } catch (error) {
      // Emit error message if any error occurs
      console.error(error.message);
      socket.emit("messageError", { message: error.message });
    }
  });

  // Listen for "stoppedTyping" events
  socket.on("stoppedTyping", (data) => {
    try {
      // Emit the message to the other sockets
      socket.broadcast
        .to("chat-" + socket.decodedRoom)
        .emit("stoppedTyping", data);
    } catch (error) {
      // Emit error message if any error occurs
      console.error(error.message);
      socket.emit("messageError", { message: error.message });
    }
  });

  // Queue to manage waiting users
  const waitingQueue = [];

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  socket.on("randomMatch", async () => {
    const Room = await roomModel();

    try {
      // Add the current socket to the waiting queue
      waitingQueue.push(socket);
      updateWebSocketStatus(socket.id, true);

      let foundSocket;

      // Continuously check for an available match
      while (waitingQueue.includes(socket)) {
        // Check if there's another socket available for matching
        foundSocket = getRandomIdleSocket(socket);

        if (foundSocket) {
          // Remove both sockets from the waiting queue
          updateWebSocketStatus(socket.id, false);
          updateWebSocketStatus(foundSocket.id, false);
          waitingQueue.splice(waitingQueue.indexOf(socket), 1);
          waitingQueue.splice(waitingQueue.indexOf(foundSocket), 1);

          break;
        }

        // Wait for a short interval before checking again
        await delay(1000);
      }

      // If no match is found, update the status to inactive and emit a search error
      if (!foundSocket) {
        updateWebSocketStatus(socket.id, false);
        socket.emit("searchError");
        return;
      }

      // Create a new room
      // const room = await Room.create({
      //   name: "Random Meetup",
      //   token: generateUniqueHash(5),
      //   room_id: generateUniqueHash(6),
      //   random: true,
      // });

      const room = await Room.insertOne({
        name: "Random Meetup",
        token: generateUniqueHash(5),
        room_id: generateUniqueHash(6),
        random: true,
      });

      // Emit 'found' event to both the current socket and the matched socket
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
      // Handle any errors that occur during the process
      console.error("Error during random match:", error);
      socket.emit("searchError");
      updateWebSocketStatus(socket.id, false);
    }
  });

  // Helper function to get a random idle socket
  // function getRandomIdleSocket(excludeSocket) {
  //   const idleSockets = waitingQueue.filter((s) => s.id !== excludeSocket.id);
  //   if (idleSockets.length === 0) return null;
  //   const randomIndex = Math.floor(Math.random() * idleSockets.length);
  //   return idleSockets[randomIndex];
  // }

  socket.on("leaveRoom", () => {
    socket.leave("chat-" + socket.decodedRoom);
    if (rooms["chat-" + socket.decodedRoom]) {
      rooms["chat-" + socket.decodedRoom].delete(socket.id);
      io.to("chat-" + socket.decodedRoom).emit(
        "updateUserCount",
        rooms["chat-" + socket.decodedRoom].size
      );
    }

    socket.broadcast
      .to("chat-" + socket.decodedRoom)
      .emit("leave", { message: "A user left the room." });
  });

  socket.on("disconnect", () => {
    console.log("Socket Disconnected");
    removeWebSocket(socket.id);
    waitingQueue.splice(waitingQueue.indexOf(socket), 1);
    // Optionally, notify others about the disconnection
    socket.broadcast
      .to("chat-" + socket.decodedRoom)
      .emit("leave", { message: "A user left the room." });

    for (const room in rooms) {
      if (rooms[room].has(socket.id)) {
        rooms[room].delete(socket.id);
        io.to(room).emit("updateUserCount", rooms[room].size);
      }
    }
  });
});

httpServer.listen(port, () => {
  console.log("Server Started");
});
