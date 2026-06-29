const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const config = require('../config/config');

const localCatalogPath = path.join(__dirname, '../data/local_catalog.json');

// In-memory catalog cache
let catalogCache = null;
let lastFetchedTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

/**
 * Loads the local JSON catalog fallback.
 */
const loadLocalCatalog = () => {
  try {
    const data = fs.readFileSync(localCatalogPath, 'utf-8');
    const localData = JSON.parse(data);
    const structured = processRawCatalogData(localData.categories, localData.products);
    return {
      ...structured,
      isCodEnabled: !config.payment.disableCod
    };
  } catch (err) {
    console.error('Failed to load local catalog fallback:', err);
    return { categories: [], productsGrouped: {}, productsMap: {}, isCodEnabled: !config.payment.disableCod };
  }
};

/**
 * Transforms raw category and product lists into the structured, grouped catalog.
 * Groups variants of the same product name in the same category.
 */
const processRawCatalogData = (rawCategories, rawProducts) => {
  // Helper to determine if a category/product is enabled
  const isEnabled = (item) => {
    const activeVal = item.Active ? item.Active.toString().trim().toUpperCase() : '';
    const statusVal = item.Status ? item.Status.toString().trim().toUpperCase() : '';

    // If either column explicitly says disabled/false, it is disabled
    if (activeVal === 'FALSE' || activeVal === 'DISABLE' || activeVal === 'DISABLED' ||
        statusVal === 'FALSE' || statusVal === 'DISABLE' || statusVal === 'DISABLED') {
      return false;
    }

    // It is enabled if either column says true/enable/enabled
    return activeVal === 'TRUE' || activeVal === 'ENABLE' || activeVal === 'ENABLED' ||
           statusVal === 'TRUE' || statusVal === 'ENABLE' || statusVal === 'ENABLED';
  };

  // 1. Parse active categories
  const categories = rawCategories
    .filter(cat => isEnabled(cat))
    .map(cat => ({
      id: cat.CategoryID.toString().trim(),
      name: cat.CategoryName.toString().trim(),
      emoji: (cat.CategoryEmoji || '').toString().trim()
    }));

  // 2. Parse active products and group variants
  const activeProducts = rawProducts.filter(prod => {
    const isActive = isEnabled(prod);
    const isOutOfStock = prod.Stock && (
      prod.Stock.toString().trim().toUpperCase() === 'FALSE' ||
      prod.Stock.toString().trim().toUpperCase() === 'OUT OF STOCK' ||
      prod.Stock.toString().trim() === '0'
    );
    return isActive && !isOutOfStock;
  });

  const productsGrouped = {}; // { categoryId: [ { name, variants: [...] } ] }
  const productsMap = {};     // { productId: { name, variantName, price, categoryId } }

  activeProducts.forEach(prod => {
    const categoryId = prod.CategoryID.toString().trim();
    const productName = prod.ProductName.toString().trim();
    const productId = prod.ProductID.toString().trim();
    const variantName = (prod.VariantName || '').toString().trim();
    const price = parseFloat(prod.Price) || 0;

    // Save flat mapping for direct ID lookup
    productsMap[productId] = {
      productId,
      categoryId,
      productName,
      variantName,
      price
    };

    if (!productsGrouped[categoryId]) {
      productsGrouped[categoryId] = [];
    }

    // Find if product with same name already exists in this category (for variant grouping)
    let product = productsGrouped[categoryId].find(p => p.name.toLowerCase() === productName.toLowerCase());
    
    if (!product) {
      product = {
        name: productName,
        variants: []
      };
      productsGrouped[categoryId].push(product);
    }

    product.variants.push({
      productId,
      variantName,
      price
    });
  });

  return {
    categories,
    productsGrouped,
    productsMap
  };
};

const sheetsService = {
  /**
   * Fetches the complete catalog.
   * Leverages caching, handles JWT or GoogleAuth authentication, and falls back to local data if needed.
   * @param {boolean} forceRefresh - If true, bypasses the cache
   */
  async getCatalog(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && catalogCache && (now - lastFetchedTime < CACHE_TTL_MS)) {
      return catalogCache;
    }

    const spreadsheetId = config.google.spreadsheetId;
    const hasServiceAccountJson = !!config.google.serviceAccountJson;
    const hasCredentialsFile = fs.existsSync(config.google.credentialsPath);

    // If Google Sheet details are missing, return local catalog immediately
    if (!spreadsheetId || spreadsheetId === 'your_google_sheet_id_here' || (!hasServiceAccountJson && !hasCredentialsFile)) {
      console.log('ℹ️ Using local JSON catalog (Google Sheets API credentials/Spreadsheet ID not set up).');
      catalogCache = loadLocalCatalog();
      lastFetchedTime = now;
      return catalogCache;
    }

    try {
      console.log('🔄 Fetching fresh catalog from Google Sheets...');
      let auth;

      if (hasServiceAccountJson) {
        const credentials = JSON.parse(config.google.serviceAccountJson);
        auth = google.auth.fromJSON(credentials);
        auth.scopes = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
      } else {
        auth = new google.auth.GoogleAuth({
          keyFile: config.google.credentialsPath,
          scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
      }

      const sheets = google.sheets({ version: 'v4', auth });

      // Fetch Categories and Products in parallel
      const [categoriesResponse, productsResponse] = await Promise.all([
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Categories!A2:E', // CategoryID, CategoryName, CategoryEmoji, Active, Status (Enable/Disable)
        }),
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Products!A2:H', // ProductID, CategoryID, ProductName, VariantName, Price, Stock, Active, Status (Enable/Disable)
        })
      ]);

      const categoriesRows = categoriesResponse.data.values || [];
      const productsRows = productsResponse.data.values || [];

      // Transform rows into objects
      const rawCategories = categoriesRows.map(row => ({
        CategoryID: row[0],
        CategoryName: row[1],
        CategoryEmoji: row[2],
        Active: row[3],
        Status: row[4]
      }));

      const rawProducts = productsRows.map(row => ({
        ProductID: row[0],
        CategoryID: row[1],
        ProductName: row[2],
        VariantName: row[3],
        Price: row[4],
        Stock: row[5],
        Active: row[6],
        Status: row[7]
      }));

      let isCodEnabled = true;
      try {
        const settingsResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Settings!A2:B', // SettingName, SettingValue
        });
        const settingsRows = settingsResponse.data.values || [];
        const settingsMap = {};
        settingsRows.forEach(row => {
          if (row[0]) {
            settingsMap[row[0].toString().trim().toUpperCase()] = row[1] ? row[1].toString().trim().toUpperCase() : '';
          }
        });
        if (settingsMap['DISABLE_COD'] === 'TRUE' || settingsMap['DISABLE_COD'] === 'YES' || settingsMap['DISABLE_COD'] === 'DISABLE') {
          isCodEnabled = false;
        } else if (settingsMap['COD_ENABLED'] === 'FALSE' || settingsMap['COD_ENABLED'] === 'NO') {
          isCodEnabled = false;
        }
      } catch (err) {
        console.log('ℹ️ Settings tab not found in Google Sheet. Falling back to environment variables.');
      }

      const structuredCatalog = processRawCatalogData(rawCategories, rawProducts);
      
      catalogCache = {
        ...structuredCatalog,
        isCodEnabled: isCodEnabled && !config.payment.disableCod
      };
      lastFetchedTime = now;
      console.log(`✅ Loaded catalog from Google Sheets successfully: ${structuredCatalog.categories.length} categories, ${Object.keys(structuredCatalog.productsMap).length} products/variants. COD Enabled: ${catalogCache.isCodEnabled}`);
      
      return catalogCache;
    } catch (err) {
      console.error('❌ Failed to fetch catalog from Google Sheets, using fallback:', err.message);
      if (catalogCache) {
        console.log('ℹ️ Using expired in-memory cache.');
        return catalogCache;
      }
      catalogCache = loadLocalCatalog();
      lastFetchedTime = now;
      return catalogCache;
    }
  }
};

module.exports = sheetsService;
