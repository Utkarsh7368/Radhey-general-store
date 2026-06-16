const sessionService = require('./session.service');
const sheetsService = require('./sheets.service');
const whatsappService = require('./whatsapp.service');
const config = require('../config/config');

const flowManager = {
  /**
   * Main entry point for routing user inputs based on current state.
   * @param {string} phone - User's WhatsApp number
   * @param {string} type - Input type: 'text' | 'button_reply' | 'list_reply' | 'location'
   * @param {any} data - Input content (e.g., text string, button ID, location object)
   * @param {string} [profileName] - Profile name from WhatsApp metadata
   */
  async handleInput(phone, type, data, profileName = '') {
    const session = sessionService.getSession(phone);
    const catalog = await sheetsService.getCatalog();

    console.log(`📱 [FLOW] User: ${phone} | State: ${session.currentState} | Input Type: ${type} | Input Data: ${JSON.stringify(data)}`);

    try {
      // Global Commands - if user types 'menu' or 'reset' or 'hi' at any point (unless they are typing details in checkout)
      if (type === 'text') {
        const textVal = data.toLowerCase().trim();
        const checkoutStates = ['CHECKOUT_NAME', 'CHECKOUT_PHONE', 'CHECKOUT_ADDRESS'];
        if ((textVal === 'menu' || textVal === 'reset' || textVal === 'hi' || textVal === 'hello') && !checkoutStates.includes(session.currentState)) {
          session.currentState = 'WELCOME';
          sessionService.saveSession(phone, session);
          return this.sendWelcome(phone);
        }

        if ((textVal === 'contact' || textVal === 'support' || textVal === 'help') && !checkoutStates.includes(session.currentState)) {
          const contactInfo = "📞 *Radhey General Store*\n\n📍 *Address:* Main Bazaar, Near Temple, Sector 4\n📱 *Call/WhatsApp:* +91 99999 99999\n⏰ *Hours:* 8:00 AM - 9:00 PM\n\nWe provide home delivery for orders above ₹100.";
          const host = config.serverUrl || 'http://localhost:3000';
          const catalogLink = `${host}/index.html?phone=${phone}`;
          return whatsappService.sendUrlButton(phone, contactInfo, '🛍️ Open Catalog', catalogLink);
        }
      }

      // State Router
      switch (session.currentState) {
        case 'WELCOME':
          await this.handleWelcomeState(phone, type, data, session);
          break;
        case 'SELECT_CATEGORY':
          await this.handleSelectCategoryState(phone, type, data, session, catalog);
          break;
        case 'SELECT_PRODUCT':
          await this.handleSelectProductState(phone, type, data, session, catalog);
          break;
        case 'SELECT_VARIANT':
          await this.handleSelectVariantState(phone, type, data, session, catalog);
          break;
        case 'SELECT_QUANTITY':
          await this.handleSelectQuantityState(phone, type, data, session, catalog);
          break;
        case 'ADDED_TO_CART':
          await this.handleAddedToCartState(phone, type, data, session, profileName);
          break;
        case 'CART':
          await this.handleCartState(phone, type, data, session, profileName);
          break;
        case 'CHECKOUT_NAME':
          await this.handleCheckoutNameState(phone, type, data, session, profileName);
          break;
        case 'CHECKOUT_PHONE':
          await this.handleCheckoutPhoneState(phone, type, data, session);
          break;
        case 'CHECKOUT_ADDRESS':
          await this.handleCheckoutAddressState(phone, type, data, session);
          break;
        case 'CHECKOUT_LOCATION':
          await this.handleCheckoutLocationState(phone, type, data, session);
          break;
        case 'CONFIRM_ORDER':
          await this.handleConfirmOrderState(phone, type, data, session);
          break;
        default:
          // Fallback to Welcome Screen
          session.currentState = 'WELCOME';
          sessionService.saveSession(phone, session);
          await this.sendWelcome(phone);
          break;
      }
    } catch (err) {
      console.error(`❌ Error in flow manager for user ${phone}:`, err);
      await whatsappService.sendText(phone, "Sorry, I encountered an issue. Let's restart from the main menu.");
      session.currentState = 'WELCOME';
      sessionService.saveSession(phone, session);
      await this.sendWelcome(phone);
    }
  },

  // ==========================================
  // STATE HANDLERS
  // ==========================================

  async sendWelcome(phone) {
    const host = config.serverUrl || 'http://localhost:3000';
    const catalogLink = `${host}/index.html?phone=${phone}`;

    const body = `Welcome to *Radhey General Store*! 🛍️\n\nYour local Grocery & Daily Needs Store. Browse our catalog, select items, and place your order in one go on your phone! Click the button below to get started:\n\n*(Type "contact" anytime for store details)*`;
    await whatsappService.sendUrlButton(phone, body, '🛍️ Open Catalog', catalogLink);
  },

  async handleWelcomeState(phone, type, data, session) {
    // Since there are no quick reply buttons in sendWelcome anymore,
    // any unrecognized message in WELCOME state will just prompt them with the welcome card.
    await this.sendWelcome(phone);
  },

  async sendCategoriesList(phone) {
    const catalog = await sheetsService.getCatalog();
    if (catalog.categories.length === 0) {
      await whatsappService.sendText(phone, "We are updating our catalog. Please try again in a few minutes.");
      return this.sendWelcome(phone);
    }

    // Build categories list
    const rows = catalog.categories.map(cat => {
      const match = cat.name.match(/(.+?)\s*\((.+?)\)/);
      let displayName = cat.name;
      let displayDesc = `Browse ${cat.name}`;

      if (match) {
        displayName = match[1].trim();
        displayDesc = match[2].trim();
      }

      return {
        id: `cat_${cat.id}`,
        title: `${cat.emoji} ${displayName}`.substring(0, 24),
        description: displayDesc.substring(0, 72)
      };
    });

    // Split rows if they exceed 10 (WhatsApp List limit is 10 rows per section/message)
    // Here we'll show the top 10 categories, or list them in multiple sections
    const sections = [{
      title: "Grocery Categories",
      rows: rows.slice(0, 10)
    }];

    await whatsappService.sendList(
      phone, 
      "Please select a category from the list below to view products:", 
      "Select Category", 
      sections,
      "Radhey General Store"
    );
  },

  async handleSelectCategoryState(phone, type, data, session, catalog) {
    if (type === 'list_reply' && data.startsWith('cat_')) {
      const categoryId = data.replace('cat_', '');
      const category = catalog.categories.find(c => c.id === categoryId);

      if (!category) {
        await whatsappService.sendText(phone, "Category not found. Let's try again.");
        return this.sendCategoriesList(phone);
      }

      session.selectedCategory = categoryId;
      session.currentState = 'SELECT_PRODUCT';
      sessionService.saveSession(phone, session);

      await this.sendProductsList(phone, categoryId, category.name, catalog);
    } else {
      // Fallback
      await this.sendCategoriesList(phone);
    }
  },

  async sendProductsList(phone, categoryId, categoryName, catalog) {
    const products = catalog.productsGrouped[categoryId] || [];

    if (products.length === 0) {
      const text = `No active products available in *${categoryName}* right now.`;
      const buttons = [
        { id: 'welcome_browse', title: '🛍️ Categories' },
        { id: 'welcome_menu', title: '🏠 Main Menu' }
      ];
      await whatsappService.sendButtons(phone, text, buttons);
      return;
    }

    // Build rows (WhatsApp list supports max 10 rows)
    const rows = products.slice(0, 10).map(prod => {
      // Check variants
      const isSingleVariant = prod.variants.length === 1;
      const minPrice = Math.min(...prod.variants.map(v => v.price));
      const firstVariantId = prod.variants[0].productId;

      let description = '';
      if (isSingleVariant) {
        const variantLabel = prod.variants[0].variantName ? ` (${prod.variants[0].variantName})` : '';
        description = `Price: ₹${prod.variants[0].price}${variantLabel}`;
      } else {
        description = `${prod.variants.length} options | Starting at ₹${minPrice}`;
      }

      return {
        id: `prod_${firstVariantId}`, // Map row ID to first variant's product ID for grouping lookup
        title: prod.name,
        description: description.substring(0, 72)
      };
    });

    const sections = [{
      title: categoryName.substring(0, 24),
      rows
    }];

    await whatsappService.sendList(
      phone,
      `Explore our items in *${categoryName}*. Choose a product below:`,
      "Select Product",
      sections,
      categoryName
    );
  },

  async handleSelectProductState(phone, type, data, session, catalog) {
    // Check back/navigation button replies first
    if (type === 'button_reply') {
      if (data === 'welcome_browse') {
        session.currentState = 'SELECT_CATEGORY';
        sessionService.saveSession(phone, session);
        return this.sendCategoriesList(phone);
      } else if (data === 'welcome_menu') {
        session.currentState = 'WELCOME';
        sessionService.saveSession(phone, session);
        return this.sendWelcome(phone);
      }
    }

    if (type === 'list_reply' && data.startsWith('prod_')) {
      const productId = data.replace('prod_', '');
      const selectedItem = catalog.productsMap[productId];

      if (!selectedItem) {
        await whatsappService.sendText(phone, "Product not found. Let's return to categories.");
        return this.sendCategoriesList(phone);
      }

      // Group items by name to identify variants
      const categoryProducts = catalog.productsGrouped[selectedItem.categoryId] || [];
      const productGroup = categoryProducts.find(p => p.name.toLowerCase() === selectedItem.productName.toLowerCase());

      if (!productGroup) {
        await whatsappService.sendText(phone, "Failed to load product details.");
        return this.sendCategoriesList(phone);
      }

      session.selectedProduct = productGroup.name;

      if (productGroup.variants.length === 1) {
        // Single variant: Skip Variant Screen, go directly to Quantity selection
        const singleVariant = productGroup.variants[0];
        session.selectedVariant = singleVariant;
        session.currentState = 'SELECT_QUANTITY';
        sessionService.saveSession(phone, session);

        await this.sendQuantitySelection(phone, productGroup.name, singleVariant);
      } else {
        // Multiple variants: Go to variant selection
        session.currentState = 'SELECT_VARIANT';
        sessionService.saveSession(phone, session);

        await this.sendVariantSelection(phone, productGroup.name, productGroup.variants);
      }
    } else {
      // Re-list products for selected category
      const category = catalog.categories.find(c => c.id === session.selectedCategory);
      const catName = category ? category.name : 'Products';
      await this.sendProductsList(phone, session.selectedCategory, catName, catalog);
    }
  },

  async sendVariantSelection(phone, productName, variants) {
    const text = `*${productName}* has multiple options. Choose a variant below:`;
    
    if (variants.length <= 3) {
      // Use quick reply buttons (max 3)
      const buttons = variants.map(v => ({
        id: `var_${v.productId}`,
        title: `${v.variantName} - ₹${v.price}`
      }));
      await whatsappService.sendButtons(phone, text, buttons);
    } else {
      // Use list message (up to 10)
      const rows = variants.slice(0, 10).map(v => ({
        id: `var_${v.productId}`,
        title: `${v.variantName}`.substring(0, 24),
        description: `Price: ₹${v.price}`
      }));
      const sections = [{
        title: "Available Options",
        rows
      }];
      await whatsappService.sendList(phone, text, "Select Variant", sections, productName);
    }
  },

  async handleSelectVariantState(phone, type, data, session, catalog) {
    const isIdMatch = (type === 'button_reply' || type === 'list_reply') && data.startsWith('var_');

    if (isIdMatch) {
      const productId = data.replace('var_', '');
      const variant = catalog.productsMap[productId];

      if (!variant) {
        await whatsappService.sendText(phone, "Option not found. Let's retry.");
        return this.sendCategoriesList(phone);
      }

      session.selectedVariant = {
        productId,
        variantName: variant.variantName,
        price: variant.price
      };
      session.currentState = 'SELECT_QUANTITY';
      sessionService.saveSession(phone, session);

      await this.sendQuantitySelection(phone, session.selectedProduct, session.selectedVariant);
    } else {
      // Re-send variants
      const categoryProducts = catalog.productsGrouped[session.selectedCategory] || [];
      const productGroup = categoryProducts.find(p => p.name.toLowerCase() === session.selectedProduct.toLowerCase());
      if (productGroup) {
        await this.sendVariantSelection(phone, productGroup.name, productGroup.variants);
      } else {
        await this.sendCategoriesList(phone);
      }
    }
  },

  async sendQuantitySelection(phone, productName, variant) {
    const variantDesc = variant.variantName ? ` (${variant.variantName})` : '';
    const text = `Choose Quantity for *${productName}${variantDesc}*:\nPrice: *₹${variant.price}*`;

    // WhatsApp list is best to select quantities from 1 to 10
    const rows = [1, 2, 3, 5, 10].map(qty => ({
      id: `qty_${variant.productId}_${qty}`,
      title: `${qty} Pack / Unit${qty > 1 ? 's' : ''}`,
      description: `Total: ₹${variant.price * qty}`
    }));

    const sections = [{
      title: "Quantity Options",
      rows
    }];

    await whatsappService.sendList(phone, text, "Select Quantity", sections, "Add to Cart");
  },

  async handleSelectQuantityState(phone, type, data, session, catalog) {
    if (type === 'list_reply' && data.startsWith('qty_')) {
      const parts = data.replace('qty_', '').split('_');
      const productId = parts[0];
      const quantity = parseInt(parts[1]) || 1;

      const variant = catalog.productsMap[productId];
      if (!variant) {
        await whatsappService.sendText(phone, "Product not found. Retrying catalog.");
        return this.sendCategoriesList(phone);
      }

      // Add to Cart Logic
      const cartItemIndex = session.cart.findIndex(item => item.productId === productId);
      if (cartItemIndex > -1) {
        session.cart[cartItemIndex].quantity += quantity;
      } else {
        session.cart.push({
          productId,
          productName: variant.productName,
          variantName: variant.variantName,
          price: variant.price,
          quantity
        });
      }

      // Update State to Add-to-Cart Confirmation Screen
      session.currentState = 'ADDED_TO_CART';
      sessionService.saveSession(phone, session);

      const variantDesc = variant.variantName ? ` (${variant.variantName})` : '';
      const successText = `✅ Added *${variant.productName}${variantDesc} x ${quantity}* to your cart!`;
      
      const buttons = [
        { id: 'cart_continue', title: '➕ Add More Items' },
        { id: 'cart_view', title: '🛒 View Cart' },
        { id: 'cart_checkout', title: '✅ Checkout' }
      ];
      await whatsappService.sendButtons(phone, successText, buttons);
    } else {
      // Re-trigger quantity selection
      await this.sendQuantitySelection(phone, session.selectedProduct, session.selectedVariant);
    }
  },

  async handleAddedToCartState(phone, type, data, session, profileName = '') {
    if (type === 'button_reply') {
      if (data === 'cart_continue') {
        session.currentState = 'SELECT_CATEGORY';
        sessionService.saveSession(phone, session);
        await this.sendCategoriesList(phone);
      } else if (data === 'cart_view') {
        session.currentState = 'CART';
        sessionService.saveSession(phone, session);
        await this.sendCartSummary(phone, session);
      } else if (data === 'cart_checkout') {
        await this.startCheckoutFlow(phone, session, profileName);
      }
    } else {
      // Resend post-add choices
      const buttons = [
        { id: 'cart_continue', title: '➕ Add More Items' },
        { id: 'cart_view', title: '🛒 View Cart' },
        { id: 'cart_checkout', title: '✅ Checkout' }
      ];
      await whatsappService.sendButtons(phone, "Please select an option:", buttons);
    }
  },

  async sendCartSummary(phone, session) {
    if (session.cart.length === 0) {
      const text = "Your cart is empty! 🛒\nStart browsing to add products.";
      const buttons = [
        { id: 'welcome_browse', title: '🛍️ Browse Catalog' },
        { id: 'welcome_menu', title: '🏠 Main Menu' }
      ];
      await whatsappService.sendButtons(phone, text, buttons);
      return;
    }

    let summary = "🛒 *Your Cart Summary*\n--------------------------------\n";
    let grandTotal = 0;

    session.cart.forEach((item, index) => {
      const variantDesc = item.variantName ? ` (${item.variantName})` : '';
      const itemTotal = item.price * item.quantity;
      grandTotal += itemTotal;
      summary += `${index + 1}. *${item.productName}${variantDesc}*\n   ₹${item.price} x ${item.quantity} = *₹${itemTotal}*\n`;
    });

    summary += `--------------------------------\n*Grand Total: ₹${grandTotal}*`;

    const buttons = [
      { id: 'cart_checkout', title: '✅ Checkout' },
      { id: 'cart_continue', title: '➕ Add More Items' },
      { id: 'cart_remove_list', title: '❌ Remove Item' }
    ];

    await whatsappService.sendButtons(phone, summary, buttons);
  },

  async handleCartState(phone, type, data, session, profileName = '') {
    if (type === 'button_reply') {
      if (data === 'cart_checkout') {
        await this.startCheckoutFlow(phone, session, profileName);
      } else if (data === 'cart_continue' || data === 'welcome_browse') {
        session.currentState = 'SELECT_CATEGORY';
        sessionService.saveSession(phone, session);
        await this.sendCategoriesList(phone);
      } else if (data === 'welcome_menu') {
        session.currentState = 'WELCOME';
        sessionService.saveSession(phone, session);
        await this.sendWelcome(phone);
      } else if (data === 'cart_remove_list') {
        // Send a list of items to remove
        const rows = session.cart.map(item => {
          const variantDesc = item.variantName ? ` (${item.variantName})` : '';
          return {
            id: `remove_${item.productId}`,
            title: `${item.productName}${variantDesc}`.substring(0, 24),
            description: `Remove ₹${item.price} x ${item.quantity}`
          };
        });

        const sections = [{
          title: "Select Item to Remove",
          rows
        }];

        await whatsappService.sendList(phone, "Select which product you want to remove:", "Remove Item", sections, "Edit Cart");
      }
    } else if (type === 'list_reply' && data.startsWith('remove_')) {
      const productId = data.replace('remove_', '');
      
      // Remove item
      session.cart = session.cart.filter(item => item.productId !== productId);
      sessionService.saveSession(phone, session);

      await whatsappService.sendText(phone, "❌ Item removed from your cart.");
      await this.sendCartSummary(phone, session);
    } else {
      await this.sendCartSummary(phone, session);
    }
  },

  // ==========================================
  // CHECKOUT FLOW MANAGEMENT
  // ==========================================

  async startCheckoutFlow(phone, session, profileName = '') {
    if (session.cart.length === 0) {
      await whatsappService.sendText(phone, "Your cart is empty! Add items before checkout.");
      return this.sendWelcome(phone);
    }

    // Step 1: Collect Name. Use profileName fallback if possible.
    session.currentState = 'CHECKOUT_NAME';
    sessionService.saveSession(phone, session);
    
    await this.promptName(phone, session, profileName);
  },

  async promptName(phone, session, profileName) {
    const suggestedName = profileName || session.customerName;
    
    if (suggestedName && suggestedName.trim().length > 1) {
      const body = `Let's gather delivery details.\n\nShould we use your name *${suggestedName.trim()}* for the delivery contact?`;
      const buttons = [
        { id: `name_use_${suggestedName.trim()}`, title: 'Yes, use my name' },
        { id: 'name_custom', title: 'No, enter other' }
      ];
      await whatsappService.sendButtons(phone, body, buttons);
    } else {
      await whatsappService.sendText(phone, "Please type your *Full Name* for delivery registration:");
    }
  },

  async handleCheckoutNameState(phone, type, data, session, profileName) {
    let nameToSave = '';

    if (type === 'button_reply') {
      if (data.startsWith('name_use_')) {
        nameToSave = data.replace('name_use_', '');
      } else {
        await whatsappService.sendText(phone, "Please type your *Full Name* now:");
        return;
      }
    } else if (type === 'text') {
      nameToSave = data.trim();
    } else {
      await this.promptName(phone, session, profileName);
      return;
    }

    if (nameToSave.length < 2) {
      await whatsappService.sendText(phone, "Please enter a valid name (at least 2 letters):");
      return;
    }

    session.customerName = nameToSave;
    session.currentState = 'CHECKOUT_PHONE';
    sessionService.saveSession(phone, session);

    // Proceed to Step 2: Phone
    await this.promptPhone(phone, session);
  },

  async promptPhone(phone, session) {
    const currentNumber = session.customerPhone || phone;
    const body = `Should we use your current WhatsApp number *+${currentNumber}* for order coordination?`;
    const buttons = [
      { id: `phone_use_${currentNumber}`, title: 'Yes, use this number' },
      { id: 'phone_custom', title: 'No, enter other' }
    ];
    await whatsappService.sendButtons(phone, body, buttons);
  },

  async handleCheckoutPhoneState(phone, type, data, session) {
    let phoneToSave = '';

    if (type === 'button_reply') {
      if (data.startsWith('phone_use_')) {
        phoneToSave = data.replace('phone_use_', '');
      } else {
        await whatsappService.sendText(phone, "Please type your 10-digit *Contact Phone Number*:");
        return;
      }
    } else if (type === 'text') {
      phoneToSave = data.replace(/[^0-9]/g, '').trim();
    } else {
      await this.promptPhone(phone, session);
      return;
    }

    if (phoneToSave.length < 10) {
      await whatsappService.sendText(phone, "Invalid phone number. Please enter a valid phone number (at least 10 digits):");
      return;
    }

    session.customerPhone = phoneToSave;
    session.currentState = 'CHECKOUT_ADDRESS';
    sessionService.saveSession(phone, session);

    // Proceed to Step 3: Address
    await this.promptAddress(phone, session);
  },

  async promptAddress(phone, session) {
    const savedAddress = session.lastSavedAddress;
    if (savedAddress && savedAddress.length > 5) {
      const body = `Deliver to your previously saved address?\n\n📍 *Saved Address:*\n${savedAddress}`;
      const buttons = [
        { id: 'addr_use_saved', title: 'Yes, deliver here' },
        { id: 'addr_custom', title: 'No, enter new address' }
      ];
      await whatsappService.sendButtons(phone, body, buttons);
    } else {
      await whatsappService.sendText(phone, "🏠 Please type your *Delivery Address* (Flat/House No, Building, Area Name, and Landmark):");
    }
  },

  async handleCheckoutAddressState(phone, type, data, session) {
    let addressToSave = '';

    if (type === 'button_reply') {
      if (data === 'addr_use_saved') {
        addressToSave = session.lastSavedAddress;
      } else {
        await whatsappService.sendText(phone, "🏠 Please type your *Delivery Address* (Flat/House No, Building, Area, and Landmark):");
        return;
      }
    } else if (type === 'text') {
      addressToSave = data.trim();
    } else {
      await this.promptAddress(phone, session);
      return;
    }

    if (addressToSave.length < 5) {
      await whatsappService.sendText(phone, "Address details are too short. Please provide a clear address:");
      return;
    }

    session.address = addressToSave;
    session.currentState = 'CHECKOUT_LOCATION';
    sessionService.saveSession(phone, session);

    // Proceed to Step 4: GPS Location
    await this.promptLocationRequest(phone);
  },

  async promptLocationRequest(phone) {
    const body = "📍 To help our delivery partner reach you quickly and avoid navigation issues, please share your GPS location.";
    await whatsappService.sendLocationRequest(phone, body);
  },

  async handleCheckoutLocationState(phone, type, data, session) {
    if (type === 'location') {
      session.location = {
        latitude: data.latitude,
        longitude: data.longitude
      };
      session.currentState = 'CONFIRM_ORDER';
      sessionService.saveSession(phone, session);

      // Show Order Confirmation summary
      await this.sendOrderConfirmationSummary(phone, session);
    } else {
      // Location was not sent, prompt again
      await whatsappService.sendText(phone, "⚠️ Location coordinates are required for GPS routing. Tap the button below:");
      await this.promptLocationRequest(phone);
    }
  },

  async sendOrderConfirmationSummary(phone, session) {
    let summary = `📝 *ORDER SUMMARY*\n`;
    summary += `Radhey General Store\n`;
    summary += `--------------------------------\n`;
    summary += `👤 *Customer:* ${session.customerName}\n`;
    summary += `📞 *Phone:* ${session.customerPhone}\n`;
    summary += `🏠 *Address:* ${session.address}\n`;
    summary += `📍 *GPS URL:* https://maps.google.com/?q=${session.location.latitude},${session.location.longitude}\n\n`;
    summary += `*Items Ordered:*\n`;

    let grandTotal = 0;
    session.cart.forEach((item) => {
      const variantDesc = item.variantName ? ` (${item.variantName})` : '';
      const itemTotal = item.price * item.quantity;
      grandTotal += itemTotal;
      summary += `- ${item.productName}${variantDesc} x ${item.quantity} = *₹${itemTotal}*\n`;
    });

    summary += `--------------------------------\n`;
    summary += `💰 *Grand Total: ₹${grandTotal}*\n\n`;
    summary += `Please review and confirm your order:`;

    const buttons = [
      { id: 'order_confirm', title: '✅ Confirm Order' },
      { id: 'order_cancel', title: '❌ Cancel' }
    ];

    await whatsappService.sendButtons(phone, summary, buttons);
  },

  async handleConfirmOrderState(phone, type, data, session) {
    if (type === 'button_reply') {
      if (data === 'order_confirm') {
        // 1. Process order and alert owner
        const ownerPhone = config.whatsapp.ownerPhone || '919999999999';
        
        let itemsText = '';
        let grandTotal = 0;
        session.cart.forEach((item, index) => {
          const variantDesc = item.variantName ? ` (${item.variantName})` : '';
          const itemTotal = item.price * item.quantity;
          grandTotal += itemTotal;
          itemsText += `${index + 1}. ${item.productName}${variantDesc} x ${item.quantity} (₹${itemTotal})\n`;
        });
        
        const gpsUrl = `https://maps.google.com/?q=${session.location.latitude},${session.location.longitude}`;

        if (config.whatsapp.ownerTemplateName) {
          // Send template message to bypass 24h window
          const bodyParams = [
            session.customerName,
            session.customerPhone,
            session.address,
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
          // Fallback: Send standard text message
          let ownerAlert = `🔔 *NEW ORDER RECEIVED*\n`;
          ownerAlert += `Radhey General Store\n`;
          ownerAlert += `--------------------------------\n`;
          ownerAlert += `👤 *Customer:* ${session.customerName}\n`;
          ownerAlert += `📞 *Phone:* ${session.customerPhone}\n`;
          ownerAlert += `🏠 *Address:* ${session.address}\n`;
          ownerAlert += `📍 *GPS Map:* ${gpsUrl}\n\n`;
          ownerAlert += `*Items:*\n${itemsText}`;
          ownerAlert += `--------------------------------\n`;
          ownerAlert += `💰 *Total Payment:* *₹${grandTotal}*\n\n`;
          ownerAlert += `Please contact the customer for delivery verification.`;

          await whatsappService.sendText(ownerPhone, ownerAlert);
        }

        // Send confirmation to customer
        const thankYouMessage = `🎉 *Thank you! Your order has been placed successfully.*\n\nOur team is packing your groceries. The store owner will contact you shortly.\n\n*Order Total:* ₹${grandTotal}\n*Delivering to:* ${session.address}`;
        await whatsappService.sendText(phone, thankYouMessage);

        // 2. Clear customer cart but save profile and address
        sessionService.clearCart(phone);

      } else if (data === 'order_cancel') {
        session.currentState = 'CART';
        sessionService.saveSession(phone, session);
        await whatsappService.sendText(phone, "❌ Your order checkout has been cancelled. Your cart items are still saved.");
        await this.sendCartSummary(phone, session);
      }
    } else {
      // Re-trigger confirmation message
      await this.sendOrderConfirmationSummary(phone, session);
    }
  }
};

module.exports = flowManager;
