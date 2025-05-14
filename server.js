// server.js
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is running.');
});

export function keepAlive() {
  app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
  });
}
