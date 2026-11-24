@echo off
title Jewellery by Riddhi - Local Folder & Website Server
echo Starting Jewellery by Riddhi Local Server on http://localhost:5501 ...
start "" "http://localhost:5501/index.html"
node local-save-server.js
pause
