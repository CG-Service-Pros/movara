#!/bin/zsh
# Restart the stageshow preview on :5199 (needed after adding a new example folder)
pkill -f "vite playground --config playground/vite.config.ts --port 5199"; sleep 1
cd "${0:A:h}" && (node_modules/.bin/vite playground --config playground/vite.config.ts --port 5199 --strictPort > /tmp/motion-vite.log 2>&1 &); sleep 4
