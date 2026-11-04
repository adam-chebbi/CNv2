import { createApp, prepareDatabase } from './app.js';

prepareDatabase();
const app = createApp();

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Café Noir API listening on http://localhost:${port}`);
});
