const axios = require('axios');
const config = require('../config/config');

/**
 * Helper to POST message payload to Meta Graph API or mock it.
 * @param {object} payload 
 * @returns {Promise<object>}
 */
const postToMeta = async (payload) => {
  const phone = payload.to;
  const { token, phoneNumberId, apiVersion } = config.whatsapp;

  const isConfigured = token && 
                       token !== 'your_whatsapp_access_token_here' && 
                       phoneNumberId && 
                       phoneNumberId !== 'your_whatsapp_phone_number_id_here';

  // If not configured, mock sending
  if (!isConfigured) {
    console.log(`🤖 [MOCK SEND to ${phone}]: type = ${payload.type}`);
    console.log(JSON.stringify(payload, null, 2));
    return { success: true, mock: true };
  }

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`✅ [REAL SEND to ${phone}] Message ID: ${response.data?.messages?.[0]?.id}`);
    return { success: true, mock: false, data: response.data };
  } catch (err) {
    const errorData = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error(`❌ [META API ERROR] when sending to ${phone}:`, errorData);
    return { success: false, mock: false, error: err.message };
  }
};

const whatsappService = {
  /**
   * Sends a simple text message.
   * @param {string} to - Recipient phone number
   * @param {string} text - Message text
   */
  async sendText(to, text) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body: text
      }
    };
    return postToMeta(payload);
  },

  /**
   * Sends an interactive message with up to 3 reply buttons.
   * @param {string} to - Recipient phone number
   * @param {string} bodyText - Core message text
   * @param {Array} buttons - Array of buttons e.g. [{ id: 'btn_1', title: 'Option 1' }]
   * @param {string} [headerText] - Optional header text
   * @param {string} [footerText] - Optional footer text
   */
  async sendButtons(to, bodyText, buttons, headerText = null, footerText = null) {
    const formattedButtons = buttons.map(btn => ({
      type: 'reply',
      reply: {
        id: btn.id,
        title: btn.title.substring(0, 20) // Meta enforces a 20-character limit on button titles
      }
    }));

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: bodyText
        },
        action: {
          buttons: formattedButtons
        }
      }
    };

    if (headerText) {
      payload.interactive.header = {
        type: 'text',
        text: headerText
      };
    }

    if (footerText) {
      payload.interactive.footer = {
        text: footerText
      };
    }

    return postToMeta(payload);
  },

  /**
   * Sends an interactive List message with up to 10 rows.
   * @param {string} to - Recipient phone number
   * @param {string} bodyText - Main text body
   * @param {string} buttonLabel - Text on the list trigger button (max 20 chars)
   * @param {Array} sections - Sections list: [{ title: 'Sec Title', rows: [{ id: 'row_1', title: 'Row Title', description: 'Desc' }] }]
   * @param {string} [headerText] - Optional header text
   * @param {string} [footerText] - Optional footer text
   */
  async sendList(to, bodyText, buttonLabel, sections, headerText = null, footerText = null) {
    // Sanitize sections and enforce Meta constraints
    const formattedSections = sections.map(sec => ({
      title: (sec.title || '').substring(0, 24), // Max 24 chars
      rows: sec.rows.map(row => ({
        id: row.id,
        title: row.title.substring(0, 24), // Max 24 chars
        description: row.description ? row.description.substring(0, 72) : undefined // Max 72 chars
      }))
    }));

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: {
          text: bodyText
        },
        action: {
          button: buttonLabel.substring(0, 20), // Max 20 chars
          sections: formattedSections
        }
      }
    };

    if (headerText) {
      payload.interactive.header = {
        type: 'text',
        text: headerText
      };
    }

    if (footerText) {
      payload.interactive.footer = {
        text: footerText
      };
    }

    return postToMeta(payload);
  },

  /**
   * Sends a native location request message. Clicking the action button opens
   * the user's GPS sharing interface.
   * @param {string} to - Recipient phone number
   * @param {string} bodyText - Body explaining why location is needed
   */
  async sendLocationRequest(to, bodyText) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'location_request_message',
        body: {
          text: bodyText
        },
        action: {
          name: 'send_location'
        }
      }
    };
    return postToMeta(payload);
  },

  /**
   * Sends a template message to initiate a conversation or bypass the 24h window.
   * @param {string} to - Recipient phone number
   * @param {string} templateName - Name of the pre-approved template on Meta
   * @param {string} languageCode - Language code, e.g., 'en'
   * @param {Array<string>} bodyParams - Ordered list of parameter values for the template body
   */
  async sendTemplate(to, templateName, languageCode = 'en', bodyParams = []) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode
        }
      }
    };

    if (bodyParams.length > 0) {
      payload.template.components = [
        {
          type: 'body',
          parameters: bodyParams.map(param => ({
            type: 'text',
            text: String(param)
          }))
        }
      ];
    }

    return postToMeta(payload);
  },

  /**
   * Sends an interactive message with a Call to Action (CTA) URL link button.
   * @param {string} to - Recipient phone number
   * @param {string} bodyText - Main text body
   * @param {string} btnTitle - Text to display on the link button
   * @param {string} url - Destination URL
   */
  async sendUrlButton(to, bodyText, btnTitle, url) {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: {
          text: bodyText
        },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: btnTitle.substring(0, 20), // Max 20 chars
            url: url
          }
        }
      }
    };
    return postToMeta(payload);
  }
};

module.exports = whatsappService;
