import { createApp } from './app';

async function bootstrap() {
  const { app, uploadService, config } = createApp();

  try {
    await uploadService.initializeStorage();
    console.log(`[ChunkFlow API] Storage directories initialized at: ${config.storageDir}`);

    const server = app.listen(config.port, config.host, () => {
      console.log(
        `[ChunkFlow API] Server is running on http://${config.host}:${config.port}`
      );
      console.log(
        `[ChunkFlow API] Max file size: ${config.maxFileSize} bytes, Default chunk size: ${config.chunkSize} bytes`
      );
    });

    const shutdown = () => {
      console.log('\n[ChunkFlow API] Shutting down server gracefully...');
      server.close(() => {
        console.log('[ChunkFlow API] Server closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('[ChunkFlow API] Failed to start server:', err);
    process.exit(1);
  }
}

void bootstrap();
