import { io } from 'socket.io-client';

// For Vercel deployment, we should use an environment variable or a fallback URL
// Replace with your actual backend URL when deploying
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

export const socket = io(SOCKET_URL, {
  autoConnect: false,
});

export const connectSocket = () => {
  if (!socket.connected) {
    socket.connect();
  }
};

export const disconnectSocket = () => {
  if (socket.connected) {
    socket.disconnect();
  }
};
