const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config();

const config = {
  port: process.env.PORT || 3000,
  serverUrl: process.env.SERVER_URL || null,
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.PHONE_NUMBER_ID,
    verifyToken: process.env.VERIFY_TOKEN || 'radhey_store_verify_token_123',
    ownerPhone: process.env.OWNER_PHONE,
    ownerTemplateName: process.env.OWNER_TEMPLATE_NAME || null,
    ownerTemplateLang: process.env.OWNER_TEMPLATE_LANG || 'en',
    apiVersion: 'v19.0',
  },
  google: {
    spreadsheetId: process.env.SPREADSHEET_ID,
    credentialsPath: path.join(__dirname, '../google/credentials.json'),
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  },
};

// Log warning if configurations are missing (will fall back to simulator and local catalog)
if (!config.whatsapp.token || config.whatsapp.token === 'your_whatsapp_access_token_here') {
  console.warn('⚠️ WARNING: WHATSAPP_TOKEN is not configured. Live WhatsApp messages will fail. Use the Web Simulator to test the flow.');
}
if (!config.whatsapp.phoneNumberId || config.whatsapp.phoneNumberId === 'your_whatsapp_phone_number_id_here') {
  console.warn('⚠️ WARNING: PHONE_NUMBER_ID is not configured. Live WhatsApp messages will fail. Use the Web Simulator to test the flow.');
}
if (!config.google.spreadsheetId || config.google.spreadsheetId === 'your_google_sheet_id_here') {
  console.warn('⚠️ WARNING: SPREADSHEET_ID is not configured. The system will fall back to local_catalog.json.');
}

module.exports = config;
