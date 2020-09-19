import { Config } from "./config";
import { Store, Stores } from "./store";
import puppeteer from "puppeteer";
import open from "open";
import sendNotification from "./notification";
import { Logger } from "./logger";

/**
 * Send test email.
 */
if (Config.notifications.test === "true") {
  sendNotification("test");
}

/**
 * Starts the bot.
 */
async function main() {
  const results = [];
  for (const store of Stores) {
    Logger.debug(store.links);
    results.push(lookup(store));
  }

  await Promise.all(results);

  Logger.info(
    "  ♻️ trying stores again\n\n\n♻️♻️♻️♻️♻️♻️♻️♻️♻️♻️♻️♻️♻️♻️♻️♻️♻️♻️♻️♻️♻️♻️\n\n"
  );
  setTimeout(main, Config.rateLimitTimeout);
}

/**
 * Responsible for looking up information about a each product within
 * a `Store`. It's important that we ignore `no-await-in-loop` here
 * because we don't want to get rate limited within the same store.
 *
 * @param store Vendor of graphics cards.
 */
async function lookup(store: Store) {
  /* eslint-disable no-await-in-loop */
  for (const link of store.links) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(Config.page.navigationTimeout);
    await page.setUserAgent(Config.page.userAgent);
    await page.setViewport({
      height: Config.page.height,
      width: Config.page.width,
    });

    const graphicsCard = `${link.brand} ${link.model}`;

    try {
      await page.goto(link.url, { waitUntil: "networkidle0" });
    } catch {
      Logger.error(
        ` ⌛ [${new Date().getMonth()}-${new Date().getDay()} ${new Date().getHours()}:${new Date().getMinutes()}:${new Date().getSeconds()}] [\x1b[33m${
          store.name
        }\x1b[0m] ${graphicsCard} skipping; \x1b[33mtimed out\x1b[0m\n`
      );
      await browser.close();
      return;
    }

    const bodyHandle = await page.$("body");
    const textContent = await page.evaluate(
      (body) => body.textContent,
      bodyHandle
    );

    Logger.debug(textContent);

    if (isOutOfStock(textContent, link.oosLabels)) {
      Logger.info(
        ` ❌ [${new Date().getMonth()}-${new Date().getDay()} ${new Date().getHours()}:${new Date().getMinutes()}:${new Date().getSeconds()}] [\x1b[31m${
          store.name
        }\x1b[0m] ${graphicsCard} is \x1b[31mout of stock\x1b[0m \n`
      );
    } else {
      Logger.info(
        `🚀🚀🚀 [${new Date().getMonth()}-${new Date().getDay()} ${new Date().getHours()}:${new Date().getMinutes()}:${new Date().getSeconds()}] [\x1b[32m${
          store.name
        }\x1b[0m] ${graphicsCard}\x1b[32m IN STOCK\x1b[0m 🚀🚀🚀\n\n\n`
      );
      Logger.info(link.url);

      Logger.debug("ℹ saving screenshot");
      await page.screenshot({ path: `success-${Date.now()}.png` });

      const givenUrl = store.cartUrl ? store.cartUrl : link.url;
      await open(givenUrl);
      sendNotification(givenUrl);
    }

    await browser.close();
  }
  /* eslint-enable no-await-in-loop */
}

/**
 * Checks if DOM has any out-of-stock related text.
 *
 * @param domText Complete DOM of website.
 * @param oosLabels Out-of-stock labels.
 */
function isOutOfStock(domText: string, oosLabels: string[]) {
  const domTextLowerCase = domText.toLowerCase();
  return oosLabels.some((label) => domTextLowerCase.includes(label));
}

/**
 * Will continually run until user interferes.
 */
try {
  void main();
} catch (error) {
  // Ignoring errors; more than likely due to rate limits
  Logger.error(error);
  void main();
}
