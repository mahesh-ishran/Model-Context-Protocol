let ws = new WebSocket("ws://localhost:9000");

ws.onmessage = (event) => console.log(event.data);

ws.onopen = () => ws.send("Hello from double client!");
