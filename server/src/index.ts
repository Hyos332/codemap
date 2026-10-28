import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { requestMap } from './jobs.js';
import { parseRepo } from './repoRef.js';
import { AppError } from './types.js';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

app.get<{ Querystring: { repo?: string } }>('/api/analyze', async (req, reply) => {
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event: string, data: unknown) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const ref = parseRepo(req.query.repo ?? '');
  if (!ref) {
    send('failure', { status: 400, message: 'Escribe un repositorio de GitHub como «usuario/proyecto».' });
    res.end();
    return;
  }

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
  const { result, detach } = requestMap(ref, (stage) => send('stage', { stage }));
  req.raw.on('close', detach);

  try {
    send('result', await result);
  } catch (err) {
    if (err instanceof AppError) {
      send('failure', { status: err.status, message: err.message });
    } else {
      req.log.error({ err, repo: ref }, 'analysis failed');
      send('failure', { status: 500, message: 'Algo falló al analizar el repositorio.' });
    }
  } finally {
    clearInterval(heartbeat);
    detach();
    res.end();
  }
});

app.get('/api/health', async () => ({ ok: true }));

const webDist = resolve(import.meta.dirname, '../../web/dist');
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const isPage = req.method === 'GET' && !pathname.startsWith('/api/') && !/\.\w+$/.test(pathname);
    return isPage ? reply.sendFile('index.html') : reply.code(404).send({ error: 'Not found' });
  });
}

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';
await app.listen({ port, host });
