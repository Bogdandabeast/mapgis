// @mapgis/server — main entry point

const server = Bun.serve({
  port: 3000,
  fetch(_req) {
    return new Response("mapgis server running");
  },
});

console.log(`mapgis server listening on http://localhost:${server.port}`);
