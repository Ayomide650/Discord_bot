// server.js
import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is running.');
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'alive', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export function keepAlive() {
  app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
  });
  
  // Self-ping every 14 minutes to prevent Render from sleeping the service
  const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes in milliseconds
  
  setInterval(async () => {
    try {
      // Get your Render app URL from environment or construct it
      const appUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
      const response = await fetch(`${appUrl}/health`);
      
      if (response.ok) {
        console.log(`✅ Self-ping successful: ${response.status} at ${new Date().toISOString()}`);
      } else {
        console.log(`⚠️ Self-ping returned: ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ Self-ping failed: ${error.message}`);
    }
  }, PING_INTERVAL);
  
  console.log(`🔄 Self-ping scheduled every ${PING_INTERVAL / 60000} minutes`);
}
