const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');

// Meta WhatsApp Webhook endpoints
router.get('/webhook', webhookController.verifyWebhook);
router.post('/webhook', webhookController.receiveWebhook);

// Web Catalog API endpoints
router.get('/api/catalog', webhookController.getCatalog);
router.post('/api/place-order', webhookController.placeOrder);
router.post('/api/create-order', webhookController.createOrder);
router.post('/api/verify-payment', webhookController.verifyPayment);

module.exports = router;
