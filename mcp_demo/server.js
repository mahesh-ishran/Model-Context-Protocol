// server.js
// Simple MCP-style server over WebSocket.
// Exposes tool metadata and allows calling tools by name.

const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const wss = new WebSocket.Server({ port: 8765 }, () => {
  console.log('MCP server listening on ws://localhost:8765');
});

// Define the tools this server exposes
const TOOLS = {
  list_tools: {
    name: 'list_tools',
    description: 'Return the list of available tools',
    params: {}
  },
  run_python: {
    name: 'run_python',
    description: 'Run a Python script from the tools/ dir with optional args. Returns stdout/stderr.',
    params: { script: 'string', args: 'array' }
  },
  read_file: {
    name: 'read_file',
    description: 'Return contents of a small text file inside server root (safe-mode).',
    params: { filepath: 'string' }
  }
};

// helper to send JSON
function send(ws, obj) {
  ws.send(JSON.stringify(obj));
}

wss.on('connection', (ws, req) => {
  console.log('Client connected');

  ws.on('message', async (msg) => {
    let m;
    try {
      m = JSON.parse(msg.toString());
    } catch (e) {
      return send(ws, { id: null, type: 'error', error: 'invalid-json' });
    }

    if (m.type === 'discover') {
      // Return tools metadata
      return send(ws, { id: m.id || null, type: 'discover_result', tools: Object.values(TOOLS) });
    }

    if (m.type === 'call_tool') {
      const { id, tool, args = {} } = m;
      if (!TOOLS[tool]) {
        return send(ws, { id, type: 'tool_error', error: `unknown_tool:${tool}` });
      }

      try {
        if (tool === 'list_tools') {
          return send(ws, { id, type: 'tool_result', result: Object.keys(TOOLS) });
        }

        if (tool === 'read_file') {
          const filepath = String(args.filepath || '');
          // Safe-mode: only allow files inside ./tools or ./data
          const allowedBase = path.resolve(__dirname, 'tools');
          const resolved = path.resolve(allowedBase, filepath);
          if (!resolved.startsWith(allowedBase)) {
            return send(ws, { id, type: 'tool_error', error: 'access_denied' });
          }
          if (!fs.existsSync(resolved)) {
            return send(ws, { id, type: 'tool_error', error: 'file_not_found' });
          }
          const content = fs.readFileSync(resolved, 'utf8');
          return send(ws, { id, type: 'tool_result', result: content });
        }

        if (tool === 'run_python') {
          const script = String(args.script || '');
          const pargs = Array.isArray(args.args) ? args.args.map(String) : [];
          const scriptBase = path.resolve(__dirname, 'tools');
          const resolvedScript = path.resolve(scriptBase, script);

          if (!resolvedScript.startsWith(scriptBase)) {
            return send(ws, { id, type: 'tool_error', error: 'access_denied' });
          }
          if (!fs.existsSync(resolvedScript)) {
            return send(ws, { id, type: 'tool_error', error: 'script_not_found' });
          }

          // Spawn Python process
          const py = spawn('python', [resolvedScript, ...pargs], { cwd: scriptBase });

          let stdout = '', stderr = '';
          // Limit output size for safety
          const MAX_BYTES = 20000;
          py.stdout.on('data', (d) => {
            stdout += d.toString();
            if (stdout.length > MAX_BYTES) stdout = stdout.slice(0, MAX_BYTES) + '\n...truncated...\n';
          });
          py.stderr.on('data', (d) => {
            stderr += d.toString();
            if (stderr.length > MAX_BYTES) stderr = stderr.slice(0, MAX_BYTES) + '\n...truncated...\n';
          });

          py.on('close', (code) => {
            send(ws, {
              id,
              type: 'tool_result',
              result: { exit_code: code, stdout, stderr }
            });
          });

          py.on('error', (err) => {
            send(ws, { id, type: 'tool_error', error: String(err) });
          });

          return;
        }

        return send(ws, { id, type: 'tool_error', error: 'unhandled_tool' });
      } catch (err) {
        return send(ws, { id, type: 'tool_error', error: String(err) });
      }
    }

    // unknown message
    send(ws, { id: m.id || null, type: 'error', error: 'unknown_message_type' });
  });

  ws.on('close', () => console.log('Client disconnected'));
});
