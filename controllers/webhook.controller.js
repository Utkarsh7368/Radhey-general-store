const config = require('../config/config');
const flowManager = require('../services/flow.manager');
const whatsappService = require('../services/whatsapp.service');
const sessionService = require('../services/session.service');

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
  }
};

module.exports = webhookController;
