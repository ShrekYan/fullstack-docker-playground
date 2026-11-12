import { WebSocketServer, WebSocket } from "ws";

const wss = new WebSocketServer({ port: 3100 });

wss.on("connection", (ws: WebSocket) => {
    ws.send("connected to ws-echo");
    ws.on("message", (data) => {
        return ws.send(`echo: ${data}`);
    });
    console.log("ws-echo on :3100");
});
