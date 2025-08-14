import app from './app.js';
import { loadEnv } from './config/env.js';

const { PORT } = loadEnv();
app.listen(PORT, () => console.log(`[server] listening on ${PORT}`));


