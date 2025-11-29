# tools/hello_tool.py
# A tiny Python script that accepts args and prints JSON-ish text.

import sys
import json

def main():
    args = sys.argv[1:]
    name = args[0] if len(args)>0 else "friend"
    count = int(args[1]) if len(args)>1 else 1

    out = {
        "message": f"Hello, {name}!",
        "repeats": count,
        "echo_args": args
    }

    # Print result as JSON to stdout
    print(json.dumps(out))

if __name__ == "__main__":
    main()
