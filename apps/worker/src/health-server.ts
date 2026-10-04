import * as http from "node:http";

// Hosting platforms that only offer "web services" (Render's free tier has no
// background workers) need something listening on PORT, and an uptime pinger can
// use the same address to keep a sleeping service awake. Only started when PORT
// is set, so a normal worker has no open port at all.
export function startHealthServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "zenora-worker" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, "0.0.0.0");
  return server;
}
