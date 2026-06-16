const config = require('../config/config');
const flowManager = require('../services/flow.manager');
const whatsappService = require('../services/whatsapp.service');
const sessionService = require('../services/session.service');
const sheetsService = require('../services/sheets.service');

// Cache of recently processed message IDs to handle Meta retries
const processedMessageIds = new Set();

const webhookController = {
  /**
   * GET /webhook
   * Webhook verification endpoint requested by Meta during setup.
   */
  verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
      if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
        console.log('✅ Webhook verified successfully by Meta.');
        return res.status(200).send(challenge);
      } else {
        console.warn('❌ Webhook verification failed. Tokens do not match.');
        return res.sendStatus(403);
      }
    }
    return res.sendStatus(400);
  },

  /**
   * POST /webhook
   * Listens for real WhatsApp messages pushed from Meta APIs.
   */
  async receiveWebhook(req, res) {
    // Auto-detect server URL if not configured in .env
    if (!config.serverUrl && req.get('host')) {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      config.serverUrl = `${protocol}://${req.get('host')}`;
      console.log(`📡 Auto-detected server public URL: ${config.serverUrl}`);
    }

    const body = req.body;

    // Standard sanity check for Meta Webhook requests
    if (body.object) {
      if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0] &&
        body.entry[0].changes[0].value.messages
      ) {
        const messageVal = body.entry[0].changes[0].value;
        const message = messageVal.messages[0];
        
        // Deduplicate retries from Meta
        const messageId = message.id;
        if (messageId) {
          if (processedMessageIds.has(messageId)) {
            console.log(`ℹ️ [DEDUPLICATE] Ignoring duplicate webhook for message ID: ${messageId}`);
            return res.status(200).send('EVENT_RECEIVED');
          }
          processedMessageIds.add(messageId);
          // Keep cache size bounded
          if (processedMessageIds.size > 500) {
            const oldestId = processedMessageIds.values().next().value;
            processedMessageIds.delete(oldestId);
          }
        }

        const contact = messageVal.contacts ? messageVal.contacts[0] : null;
        
        const phone = message.from;
        const profileName = contact ? contact.profile.name : '';

        // Extract action based on type
        let inputType = '';
        let inputData = null;

        if (message.type === 'text') {
          inputType = 'text';
          inputData = message.text.body;
        } else if (message.type === 'interactive') {
          const interactive = message.interactive;
          if (interactive.type === 'button_reply') {
            inputType = 'button_reply';
            inputData = interactive.button_reply.id;
          } else if (interactive.type === 'list_reply') {
            inputType = 'list_reply';
            inputData = interactive.list_reply.id;
          }
        } else if (message.type === 'location') {
          inputType = 'location';
          inputData = {
            latitude: message.location.latitude,
            longitude: message.location.longitude
          };
        }

        // Process message through State Flow
        if (inputType) {
          try {
            await flowManager.handleInput(phone, inputType, inputData, profileName);
          } catch (err) {
            console.error('Error handling message in flow manager:', err);
          }
        }
      }
      // Meta expects a 200 OK to acknowledge receipt
      return res.status(200).send('EVENT_RECEIVED');
    } else {
      // Return 404 if event is not from WhatsApp API
      return res.sendStatus(404);
    }
  },

  /**
   * GET /api/catalog
   * Fetches the inventory catalog (categories and products) from Sheets/Local cache.
   */
  async getCatalog(req, res) {
    try {
      const catalog = await sheetsService.getCatalog();
      return res.json({
        ...catalog,
        botPhone: config.whatsapp.botPhone
      });
    } catch (err) {
      console.error('❌ Error fetching catalog via API:', err);
      return res.status(500).json({ error: 'Failed to load catalog.' });
    }
  },

  /**
   * POST /api/place-order
   * Places an order from the Web Catalog, notifies owner and customer.
   */
  async placeOrder(req, res) {
    const { phone, name, address, location, cart } = req.body;

    if (!phone || !name || !address || !location || !cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: 'Invalid order payload. Missing required fields.' });
    }

    try {
      // Fetch catalog to get secure pricing
      const catalogData = await sheetsService.getCatalog();
      let itemsText = '';
      let grandTotal = 0;
      const verifiedCart = [];

      for (const item of cart) {
        const secureProduct = catalogData.productsMap[item.productId];
        if (!secureProduct) {
          return res.status(400).json({ error: `Product ID ${item.productId} not found in catalog.` });
        }
        
        const price = secureProduct.price;
        const variantDesc = secureProduct.variantName ? ` (${secureProduct.variantName})` : '';
        const itemTotal = price * item.quantity;
        grandTotal += itemTotal;
        
        itemsText += `${secureProduct.productName}${variantDesc} x ${item.quantity} (₹${itemTotal})\n`;
        verifiedCart.push({
          productId: item.productId,
          productName: secureProduct.productName,
          variantName: secureProduct.variantName,
          price,
          quantity: item.quantity
        });
      }

      // Fetch session and save details
      sessionService.saveSession(phone, {
        customerName: name,
        customerPhone: phone,
        address: address,
        location: location,
        cart: verifiedCart // update cart in session with verified prices
      });

      const ownerPhone = config.whatsapp.ownerPhone || '919999999999';
      const gpsUrl = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;

      // Execute WhatsApp notifications asynchronously in the background
      // This allows returning the successful order response to the browser instantly
      (async () => {
        try {
          // 1. Send Order Alert to Store Owner
          if (config.whatsapp.ownerTemplateName) {
            const bodyParams = [
              name,
              phone,
              address,
              gpsUrl,
              itemsText.trim(),
              `₹${grandTotal}`
            ];
            await whatsappService.sendTemplate(
              ownerPhone,
              config.whatsapp.ownerTemplateName,
              config.whatsapp.ownerTemplateLang,
              bodyParams
            );
          } else {
            let ownerAlert = `🔔 *NEW ORDER RECEIVED*\n`;
            ownerAlert += `Radhey General Store\n`;
            ownerAlert += `--------------------------------\n`;
            ownerAlert += `👤 *Customer:* ${name}\n`;
            ownerAlert += `📞 *Phone:* ${phone}\n`;
            ownerAlert += `🏠 *Address:* ${address}\n`;
            ownerAlert += `📍 *GPS Map:* ${gpsUrl}\n\n`;
            ownerAlert += `*Items:*\n${itemsText}`;
            ownerAlert += `--------------------------------\n`;
            ownerAlert += `💰 *Total Payment:* *₹${grandTotal}*\n\n`;
            ownerAlert += `Please contact the customer for delivery verification.`;

            await whatsappService.sendText(ownerPhone, ownerAlert);
          }
        } catch (err) {
          console.error('❌ Failed to alert store owner:', err);
        }

        try {
          // 2. Send Order Confirmation receipt to Customer
          const thankYouMessage = `🎉 *Thank you! Your order has been placed successfully.*\n\nOur team is packing your groceries. The store owner will contact you shortly.\n\n*Order Total:* ₹${grandTotal}\n*Delivering to:* ${address}`;
          await whatsappService.sendText(phone, thankYouMessage);
        } catch (err) {
          console.error('❌ Failed to send customer confirmation receipt:', err);
        }
      })();

      // 3. Clear customer cart session but save profile and address
      sessionService.clearCart(phone);

      const ownerUpiId = config.whatsapp.ownerUpiId || '919110170322@ybl';

      return res.status(200).json({ 
        success: true, 
        message: 'Order processed successfully.',
        grandTotal,
        ownerUpiId,
        orderId: Math.floor(100000 + Math.random() * 900000)
      });
    } catch (err) {
      console.error('❌ Error in placeOrder endpoint:', err);
      return res.status(500).json({ error: 'Failed to process the order.' });
    }
  }
};

module.exports = webhookController;
