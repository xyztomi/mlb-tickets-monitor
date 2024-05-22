const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const BlockResourcesPlugin = require('puppeteer-extra-plugin-block-resources');
const UserPreferencesPlugin = require('puppeteer-extra-plugin-user-preferences');
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
const ProxyRouter = require('@extra/proxy-router');
const fs = require('fs');
const dotenv = require('dotenv');
const process = require('process');
const xml2js = require('xml2js');
process.removeAllListeners('warning');

// Load environment variables from .env file
dotenv.config({ path: './PROXIES.env' });

// Configure puppeteer plugins
puppeteer.use(StealthPlugin());
puppeteer.use(BlockResourcesPlugin({
  blockedTypes: new Set(['image', 'stylesheet', 'font']),
}));
puppeteer.use(UserPreferencesPlugin({
  preferences: {
    'intl.accept_languages': 'en-US,en;q=0.9',
    'geolocation.default': 'US',
  },
}));
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

// Sleep function
const sleep = ms => new Promise(res => setTimeout(res, ms));

// Load proxies from environment variable
const proxyList = process.env.PROXIES ? process.env.PROXIES.split('\n') : [];

// Function to get a random proxy from the list with authentication
function getRandomProxy() {
  if (proxyList.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * proxyList.length);
  const proxyString = proxyList[randomIndex];
  const [username, password, ip, port] = proxyString.split(':');
  return `http://${username}:${password}@${ip}:${port}`;
}
const randomProxy = getRandomProxy();
console.log("Your proxy: ", randomProxy);

puppeteer.use(ProxyRouter({
  proxies: { DEFAULT: randomProxy },
  muteProxyErrors: true
}));

// Function to parse XML and save to result.json
const parseAndSaveXML = (xmlData) => {
  const parser = new xml2js.Parser();
  parser.parseString(xmlData, (err, result) => {
    if (err) throw err;

    // Extract master_config
    const masterConfig = result.map_response.master_config[0];
    const sectionConfig = masterConfig.section_config[0].section || [];
    const sectionInventory = masterConfig.section_inventory[0].section || [];
    const priceStructure = result.map_response.price_structure[0].pricescale || [];

    // Create a map for price id to price
    const priceMap = {};
    priceStructure.forEach(scale => {
      priceMap[scale.$.id] = scale.$.ref_price;
    });

    // Create a map for section id to available amount and price scale ids
    const inventoryMap = {};
    sectionInventory.forEach(section => {
      const pricescales = (section.pricescale || []).map(ps => ({
        id: ps.$.id,
        available: ps.$.available
      }));
      inventoryMap[section.$.id] = pricescales;
    });

    // Extract and display required data
    const resultData = sectionConfig.map(section => {
      const id = section.$.id;
      const name = section.$.section_public_code;
      const inventory = inventoryMap[id] || [];

      const prices = inventory.map(inv => ({
        price: priceMap[inv.id],
        available: inv.available
      }));

      return {
        id,
        name,
        prices
      };
    });

    // Write the result to result.json
    fs.writeFile('result.json', JSON.stringify(resultData, null, 2), err => {
      if (err) throw err;
      console.log('Data has been written to result.json');
    });
  });
};

// Main function
async function main(url) {
  const browser = await puppeteer.launch({
    ignoreHTTPSErrors: true,
    headless: true,
    defaultViewport: { width: 800, height: 600 },
    args: [
      "--start-maximized",
      "--no-sandbox",
      "--disable-web-security",
      "--disable-features=site-per-process",
      `--lang=en`,
    ],
  });

  const page = await browser.newPage();
  console.log("Intercepting...");
  await page.setRequestInterception(true);

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('https://mlb.tickets.com/api/pvodc/v1/events/navmap/availability')) {
      console.log("Got the API url...");
      const textResponse = await response.text();
      fs.writeFileSync('resultHeadless.xml', textResponse, 'utf-8');
      console.log('Intercepted response saved to resultHeadless.xml');
      
      // Parse and save the XML data
      parseAndSaveXML(textResponse);
    }
  });

  await page.goto(url);
  // await sleep(2000); 

  await browser.close();
}

// Get the URL from command-line arguments
const url = process.argv[2];

// Call the main function with the provided URL
main(url).catch(error => console.error(error));
