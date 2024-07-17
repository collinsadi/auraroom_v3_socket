const getRandomPair = require("./randomName");

// Create a Map to store WebSocket connections
let webSocketMap = new Map();

// Function to add a Socket.IO connection to the Map
function addWebSocket(id, socket) {
  const name = getRandomPair();
  webSocketMap.set(id, { socket: socket, isIdle: false, name });

  console.log(webSocketMap);
}

// Function to update the WebSocket status
function updateWebSocketStatus(id, isIdle) {
  if (webSocketMap.has(id)) {
    let webSocketEntry = webSocketMap.get(id);
    webSocketEntry.isIdle = isIdle;
    webSocketMap.set(id, webSocketEntry);
  }
}

// Function to remove a WebSocket from the Map
function removeWebSocket(id) {
  if (webSocketMap.has(id)) {
    webSocketMap.delete(id);
  }
}

// Function to get a random idle socket
function getRandomIdleSocket(excludeSocket) {
  const idleSockets = Array.from(webSocketMap.values()).filter(
    (entry) => entry.isIdle && entry.socket !== excludeSocket
  );
  if (idleSockets.length === 0) return null;
  return idleSockets[Math.floor(Math.random() * idleSockets.length)].socket;
}

module.exports = {
  addWebSocket,
  updateWebSocketStatus,
  removeWebSocket,
  getRandomIdleSocket,
};
