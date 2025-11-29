# client_test.py
# Simple test client for the MCP WebSocket server.

import websocket
import json
import threading
import time
import uuid

WS_URL = "ws://localhost:8765"

def on_message(ws, message):
    msg = json.loads(message)
    print("RECV:", json.dumps(msg, indent=2))

def on_open(ws):
    print("Connected. Discovering tools...")
    # send discover
    msg = {"id": str(uuid.uuid4()), "type": "discover"}
    ws.send(json.dumps(msg))
    time.sleep(0.2)

    # Call list_tools
    msg = {"id": str(uuid.uuid4()), "type": "call_tool", "tool": "list_tools", "args": {}}
    ws.send(json.dumps(msg))
    time.sleep(0.2)

    # Call run_python: run hello_tool.py with args
    msg = {
        "id": str(uuid.uuid4()),
        "type": "call_tool",
        "tool": "run_python",
        "args": {"script": "hello_tool.py", "args": ["Mahesh", "3"]}
    }
    ws.send(json.dumps(msg))
    time.sleep(0.2)

    # Call read_file
    msg = {"id": str(uuid.uuid4()), "type": "call_tool", "tool": "read_file", "args": {"filepath": "notes.txt"}}
    ws.send(json.dumps(msg))

def on_error(ws, err):
    print("ERROR:", err)

def on_close(ws, code, reason):
    print("Closed", code, reason)

if __name__ == "__main__":
    websocket.enableTrace(False)
    ws = websocket.WebSocketApp(WS_URL,
                                on_open=on_open,
                                on_message=on_message,
                                on_error=on_error,
                                on_close=on_close)
    ws.run_forever()
