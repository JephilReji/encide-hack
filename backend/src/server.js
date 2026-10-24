require('dotenv').config();

const { createApp } = require('./app');

const PORT = Number.parseInt(process.env.PORT || '3001', 10);
const app = createApp();

app.listen(PORT, () => {
  console.log(`cliff-guard-api listening on http://localhost:${PORT}`);
});
