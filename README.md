# Radhey General Store — WhatsApp Grocery Ordering System

A production-ready, highly interactive WhatsApp Grocery Ordering System built for **Radhey General Store**. The system is designed like Blinkit, Zepto, and Instamart inside WhatsApp, leveraging **Interactive Lists**, **Reply Buttons**, and **Native GPS Location sharing** so that customer typing is virtually eliminated.

Google Sheets is used as the inventory and category database (Admin Panel). Changes to prices, items, or categories in the Google Sheet are updated in the bot automatically.

---

## Features & Flows

- 🛍️ **Interactive Categories**: Renders active product categories using WhatsApp List Messages.
- 🍞 **Product Variant Selector**: Automatically groups variants of the same product (e.g. Bread: Small, Medium, Large) and presents them as quick reply buttons or list items.
- 🥛 **Single-Variant Shortcut**: If a product has only one variant (e.g. Milk 1L), the variant screen is skipped and quantity selection is shown immediately.
- 🔢 **Quantity Selection**: Quick-select quantities (1, 2, 3, 5, 10) directly via lists.
- 🛒 **Cart Management**: Fully interactive cart. Users can review items, continue shopping, and select items to remove using list buttons.
- 📍 **One-Click Delivery Details**:
  - Uses the customer's WhatsApp profile name and phone number as suggested values.
  - Remembers the delivery address for returning customers, allowing one-click checkouts.
  - Prompts customers to share their GPS location using WhatsApp's native location-sharing interface to generate direct Google Maps routing links for delivery partners.
- 🔔 **Owner Alerts**: Instantly forwards finalized receipts, customer details, and Google Maps location links to the store owner's WhatsApp JID.

---

## Directory Structure

```text
/config        - Environment variable parsing & validations
/controllers   - Webhook controller (parses Meta message payloads)
/routes        - Webhook routes mounting
/services      - Core modules (WhatsApp API, Google Sheets API, Sessions, Flow State Machine)
/google        - Storage location for Google Service Account credentials.json
/data          - Local catalog fallbacks and sessions.json persistence
/webhooks      - Webhook integration entry points
app.js         - Express Server configuration
package.json   - Dependency declarations
.env           - Secret keys and parameters configuration
```

---

## 1. Google Sheets Setup Guide

The store owner manages inventory directly from Google Sheets. 

### A. Spreadsheet Structure
Create a new Google Spreadsheet and create two worksheets with the **exact** names and columns shown below:

#### Sheet 1: `Categories`
| CategoryID | CategoryName | CategoryEmoji | Active |
|---|---|---|---|
| 1 | Anaj & Dal | 🍚 | TRUE |
| 2 | Grocery Essentials | 🥣 | TRUE |
| 3 | Dairy & Snacks | 🥛 | TRUE |

#### Sheet 2: `Products`
| ProductID | CategoryID | ProductName | VariantName | Price | Stock | Active |
|---|---|---|---|---|---|---|
| 101 | 3 | Bread | Small | 10 | TRUE | TRUE |
| 102 | 3 | Bread | Medium | 20 | TRUE | TRUE |
| 103 | 3 | Bread | Large | 30 | TRUE | TRUE |
| 104 | 3 | Milk | 1L Pack | 65 | TRUE | TRUE |

*Notes:*
- Emojis in `CategoryEmoji` are displayed directly in the category selection list.
- If multiple products share the **same** `ProductName` within the same category (e.g. `Bread`), they are grouped as variants.
- Mark an item out of stock by setting `Stock` to `FALSE` or `0` or `OUT OF STOCK`.
- To hide a category or product, set `Active` to `FALSE`.

---

### B. Google Sheets API Activation
To allow the application to read your sheet dynamically:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project and search for **Google Sheets API**, then click **Enable**.
3. Go to **APIs & Services** > **Credentials** and click **Create Credentials** > **Service Account**.
4. Create the service account and select **Create Key** > **JSON**. Download this file, rename it to `credentials.json` and move it to your project's `/google/` folder.
5. Open the downloaded JSON key file, copy the `client_email` value (looks like `something@yourproject.iam.gserviceaccount.com`).
6. Open your Google Spreadsheet, click **Share**, paste the service account email, and select **Viewer** access.
7. Copy the Spreadsheet ID from the spreadsheet URL:
   `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit...`

---

## 2. Installation & Quick Start

1. **Clone the project** and open the directory:
   ```bash
   cd Whatsapp-bot
   ```
2. **Install node dependencies**:
   ```bash
   npm install
   ```
3. **Configure Environment variables**:
   Create or open the `.env` file in the root directory:
   - Provide your `SPREADSHEET_ID`.
   - Provide your `OWNER_PHONE` (with country code, e.g. `919999999999`).
   - If testing live WhatsApp, enter `WHATSAPP_TOKEN` and `PHONE_NUMBER_ID` from the Meta Developer Portal.
4. **Run in Development Mode**:
   ```bash
   npm run dev
   ```
   This will boot up the Express server on port `3000`. If `credentials.json` or spreadsheet configuration is missing, the server will log a warning and fall back to the built-in catalog fallback (`data/local_catalog.json`).

---

## 3. Meta Webhook Setup (Production Mode)

Once you are ready to link the application to a live WhatsApp Business Account:

1. **Start ngrok** (or another tunnel service) to expose your local port publicly:
   ```bash
   ngrok http 3000
   ```
2. Copy your public `https` URL (e.g., `https://abcdef.ngrok-free.app`).
3. Go to the [Meta Developer Dashboard](https://developers.facebook.com/) > Select your App > Add **WhatsApp** product.
4. Go to **WhatsApp** > **Configuration**:
   - Set **Callback URL** to: `https://abcdef.ngrok-free.app/webhook`
   - Set **Verify Token** to the value defined in your `.env` (default is `radhey_store_verify_token_123`).
5. Click **Verify and Save**.
6. Under **Webhook Fields**, click **Manage** and subscribe to **messages**.
7. Now, send a message to your WhatsApp test phone number. The webhook will route events to your local server, and you'll see the replies on your phone!

---

## 4. Deployment Guide

When deploying to hosting platforms like **Render**, **Heroku**, or **DigitalOcean**:
1. Upload your code repository (excluding `.env` and `google/credentials.json` for security).
2. In the hosting platform dashboard under **Environment Variables**, set:
   - `PORT=80` (or leave default)
   - `WHATSAPP_TOKEN=...`
   - `PHONE_NUMBER_ID=...`
   - `VERIFY_TOKEN=...`
   - `OWNER_PHONE=...`
   - `SPREADSHEET_ID=...`
   - `GOOGLE_SERVICE_ACCOUNT_JSON=...` (Paste the entire contents of your Google Service Account key JSON file as a single line string. The bot's Sheet Service is programmed to read this string directly if `google/credentials.json` is missing).
3. Connect your code to deploy. The platform will spin up the server, and you can point Meta's webhook to your production server URL.
