const fs = require('fs');
const path = require('path');

const sessionsFilePath = path.join(__dirname, '../data/sessions.json');

// Memory cache of sessions
let sessions = {};

// Helper to ensure data directory and sessions file exist
const initSessionsFile = () => {
  const dataDir = path.dirname(sessionsFilePath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(sessionsFilePath)) {
    fs.writeFileSync(sessionsFilePath, JSON.stringify({}, null, 2), 'utf-8');
  } else {
    try {
      const data = fs.readFileSync(sessionsFilePath, 'utf-8');
      sessions = JSON.parse(data);
    } catch (err) {
      console.error('Error reading sessions.json, resetting session cache:', err);
      sessions = {};
    }
  }
};

// Initialize sessions on load
initSessionsFile();

const saveSessionsToDisk = () => {
  try {
    fs.writeFileSync(sessionsFilePath, JSON.stringify(sessions, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write sessions to sessions.json:', err);
  }
};

const sessionService = {
  /**
   * Retrieves or initializes a session for a given phone number.
   * @param {string} phone - User's WhatsApp number
   * @returns {object} - The session object
   */
  getSession(phone) {
    if (!sessions[phone]) {
      sessions[phone] = {
        currentState: 'WELCOME',
        selectedCategory: null,
        selectedProduct: null,
        selectedVariant: null,
        cart: [],
        customerName: null,
        customerPhone: phone,
        address: null,
        location: null,
        lastSavedAddress: null, // To support one-click checkout address re-use
        lastInteraction: new Date().toISOString()
      };
      saveSessionsToDisk();
    }
    
    // Add missing default fields for backward compatibility if any
    const session = sessions[phone];
    if (!session.cart) session.cart = [];
    if (!session.customerPhone) session.customerPhone = phone;
    
    return session;
  },

  /**
   * Updates and saves a session.
   * @param {string} phone 
   * @param {object} sessionData 
   */
  saveSession(phone, sessionData) {
    sessions[phone] = {
      ...this.getSession(phone),
      ...sessionData,
      lastInteraction: new Date().toISOString()
    };
    saveSessionsToDisk();
  },

  /**
   * Clears the current cart and temporary flow variables, but retains customer profile and saved address.
   * @param {string} phone 
   */
  clearCart(phone) {
    const session = this.getSession(phone);
    
    // Store address for reuse
    const addressToSave = session.address || session.lastSavedAddress;

    sessions[phone] = {
      ...session,
      currentState: 'WELCOME',
      selectedCategory: null,
      selectedProduct: null,
      selectedVariant: null,
      cart: [],
      address: null,
      location: null,
      lastSavedAddress: addressToSave,
      lastInteraction: new Date().toISOString()
    };
    saveSessionsToDisk();
  },

  /**
   * Returns a copy of all sessions (useful for the Simulator dashboard view).
   */
  getAllSessions() {
    return { ...sessions };
  }
};

module.exports = sessionService;
