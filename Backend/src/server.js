const { app } = require("./app");
const { env } = require("./config/env");
const { prisma } = require("./config/prisma");

const server = app.listen(env.PORT, () => {
  console.log(`[server] listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down...`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (err) {
      console.error("[server] prisma disconnect error", err);
    } finally {
      process.exit(0);
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
