#!/bin/bash
cd "$(dirname "$0")"
export PYTHONPATH="$(pwd)"
source .venv/bin/activate
echo "Starting SafeDoc server..."
echo "Server will be available at http://127.0.0.1:8000"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
