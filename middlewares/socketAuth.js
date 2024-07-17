const { roomModel } = require("../config/connectDB"); // Import the room model from the database config

const authenticateSocket = async (socket, next) => {
  try {
    const Room = await roomModel(); // Get the Room model to interact with the database

    const { auth, query } = socket.handshake; // Destructure auth and query from the socket handshake
    const token = auth?.token || query?.token || null; // Get token from auth or query
    const room = auth?.room || query?.room || null; // Get room from auth or query
    // const p256dh = auth?.p256dh || query?.p256dh || null; // Optionally get p256dh if needed

    // If the room is "family", mark it and proceed
    if (room === "family") {
      socket.forFamily = true;
      return next(); // Move to the next middleware or connection
    }

    // If either token or room is missing, throw an error
    if (!token || !room) {
      return next(new Error("Authentication error")); // Signal an authentication error
    }

    // Check if the room exists in the database
    const roomIsValid = await Room.findOne({ room_id: room });
    if (!roomIsValid) {
      return next(new Error("Authentication error")); // Signal an authentication error
    }

    // Check if the token matches the room's token
    const passwordIsValid = roomIsValid.token === token;
    if (!passwordIsValid) {
      return next(new Error("Authentication error")); // Signal an authentication error
    }

    // If everything is valid, save room details to the socket for later use
    socket.decodedRoom = room;
    socket.decodedRoomName = roomIsValid.name;

    next(); // Move to the next middleware or connection
  } catch (error) {
    next(new Error("Authentication error")); // Handle any unexpected errors
  }
};

module.exports = { authenticateSocket }; // Export the authenticateSocket function
