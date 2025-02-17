import { io, Socket } from 'socket.io-client';

// Define the base URL for the Socket.io server
const BASE_URL = 'http://localhost:3001';

// Create a Socket.io client instance
const socket: Socket = io(BASE_URL, {
  transports: ['websocket'], // Ensure WebSocket transport is used
  autoConnect: false,        // Do not connect automatically
});

// Export the socket instance
export default socket;