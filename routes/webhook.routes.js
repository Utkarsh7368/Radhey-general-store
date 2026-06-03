const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');

// Meta WhatsApp Webhook endpoints
router.get('/webhook', webhookController.verifyWebhook);
router.post('/webhook', webhookController.receiveWebhook);

module.exports = router;
