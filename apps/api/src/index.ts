import { buildServer } from './server.js';
import { loadEnv } from './env.js';

const env = loadEnv();

const app = await buildServer(env);

// Binds 0.0.0.0 by default: the container has to be reachable from outside it.
await app.listen({ host: env.HOST, port: env.PORT });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    app.log.info({ signal }, 'shutting down');
    void app.close().then(() => process.exit(0));
  });
}
