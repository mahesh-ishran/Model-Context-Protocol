// static-server.js
const express = require('express');
const path = require('path');
const app = express();

const PORT = 3000;
const STATIC_DIR = path.resolve(__dirname); // serve current directory

app.use(express.static(STATIC_DIR));

app.get('/', (req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));

app.listen(PORT, () => console.log(`Static server serving ${STATIC_DIR} at http://localhost:${PORT}`));
