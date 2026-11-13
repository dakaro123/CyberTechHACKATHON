import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { createFxProvider, loadConfig } from './config';
import { WiseFlowService } from './service';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = loadConfig();
const fx = createFxProvider(config);
const service = new WiseFlowService({ fx });
const webDist = path.join(root, 'web', 'dist');
const app = createApp(service, { webDist });

app.listen(config.port, () => {
  console.log(`Wise Flow API  http://localhost:${config.port}/api`);
  console.log(`FX provider    ${fx.description}`);
  if (existsSync(path.join(webDist, 'index.html'))) {
    console.log(`Web app        http://localhost:${config.port}`);
  }
});
