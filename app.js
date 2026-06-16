const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const config = require('./config/config');
const webhookRoutes = require('./routes/webhook.routes');
const sheetsService = require('./services/sheets.service');

const app = express();

// Midleware configurations
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Log incoming requests for debugging
app.use((req, res, next) => {
  if (req.path.startsWith('/webhook')) {
    console.log(`✉️ [HTTP] ${req.method} ${req.path}`);
  }
  next();
});

// Mount Webhook routes
app.use('/', webhookRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Express Unhandled Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Pre-fetch Google Sheets catalog on startup to initialize cache
const initializeCatalog = async () => {
  try {
    await sheetsService.getCatalog(true);
    console.log('✅ Local or Sheets Catalog loaded successfully.');
  } catch (err) {
    console.warn('⚠️ Google Sheets catalog could not be fetched on start. App will use local cache/fallback catalog.');
  }
};

// Start the server
const server = app.listen(config.port, async () => {
  console.log(`🚀 ==================================================`);
  console.log(`🚀 Radhey General Store Bot is running!`);
  console.log(`🚀 Local Server Address: http://localhost:${config.port}`);
  console.log(`🚀 Webhook URL: http://localhost:${config.port}/webhook`);
  console.log(`🚀 ==================================================`);
  
  // Pre-load catalog
  await initializeCatalog();
});

module.exports = { app, server };
