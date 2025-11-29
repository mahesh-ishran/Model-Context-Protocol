const WebSocket = require('ws');

const server = new WebSocket.Server({ port: 9000 });

server.on('connection', socket => {
  console.log("Client connected");

  socket.on('message', msg => {
    console.log("Received:", msg);
    socket.send("Server got your message!");
  });
});