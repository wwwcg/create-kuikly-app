#!/bin/bash
# Simple static file server for local development
# Serves files from the current directory on port 8000

PORT=${1:-8000}
echo "Starting static server on http://localhost:$PORT"
python3 -m http.server $PORT
