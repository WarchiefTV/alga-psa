import puppeteer from 'puppeteer';
import type { Browser, Page } from 'puppeteer';

class PuppeteerManager {
  private static instance: PuppeteerManager;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isInitializing = false;

  private constructor() {}

  public static getInstance(): PuppeteerManager {
    if (!PuppeteerManager.instance) {
      PuppeteerManager.instance = new PuppeteerManager();
    }
    return PuppeteerManager.instance;
  }

  public async init(options?: { headless: boolean, args: string[] }, retries = 5) {
    if (this.browser || this.isInitializing) {
      console.log('Puppeteer already initialized or initializing');
      return;
    }

    console.log('Starting Puppeteer initialization...');
    this.isInitializing = true;
    let attempt = 0;

    while (attempt < retries) {
      attempt++;
      console.log(`Attempt ${attempt} of ${retries}...`);
      
      try {
        console.log('Launching browser with args:', [
          '--window-size=1900,1200'
        ]);

        this.browser = await puppeteer.launch({
          executablePath: puppeteer.executablePath(), // Use bundled Chromium
          headless: options?.headless ?? true,
          args: options?.args ?? [
            '--window-size=1900,1200'
          ],
          protocolTimeout: 60000, // Increase timeout to 60 seconds
          dumpio: true, // Enable verbose logging
          slowMo: 100 // Add slight delay between operations
        });

        console.log('Browser launched successfully. Creating new page...');
        try {
          this.page = await this.browser.newPage();
          // this.page.setDefaultNavigationTimeout(30000);
          // this.page.setDefaultTimeout(5000);
          
          if (!this.page) {
            throw new Error('Page creation returned null');
          }
          
          await this.page.setViewport({ width: 1900, height: 1200 });
          console.log('Page created successfully. Setting up event listeners...');
          this.page.on('console', (msg) => {
            console.log(`[PAGE CONSOLE] ${msg.type()}: ${msg.text()}`);
          });
          this.page.on('pageerror', (err) => {
            console.error(`[PAGE ERROR]`, err);
          });
          console.log('Puppeteer initialization completed successfully');
          break; // Successfully initialized
        } catch (pageError) {
          console.error('Failed to create new page:', pageError);
          throw pageError;
        }
      } catch (error) {
        console.error(`Puppeteer initialization attempt ${attempt} failed:`, error);
        
        // Clean up any partial initialization
        if (this.browser) {
          console.log('Cleaning up failed initialization...');
          await this.browser.close();
          this.browser = null;
          this.page = null;
        }

        if (attempt >= retries) {
          console.error(`Failed to initialize Puppeteer after ${retries} attempts`);
          throw new Error(`Failed to initialize Puppeteer after ${retries} attempts`);
        }

        const waitTime = 1000 * attempt;
        console.log(`Waiting ${waitTime}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    this.isInitializing = false;
  }

  public getPage(): Page {
    if (!this.page) {
      throw new Error('Puppeteer page not initialized yet');
    }
    return this.page;
  }

  public async execute_automation_script(script: string): Promise<any> {
    console.log('Executing automation script:', script);
    
    if (!this.page) {
      throw new Error('Puppeteer page not initialized yet');
    }
    
    try {
      // Dynamically import helper with cache busting
      let PuppeteerHelper;
      try {
        const helperUrl = new URL('./puppeteerHelper.ts', import.meta.url);
        helperUrl.searchParams.set('t', Date.now().toString());
        console.log('[Module Loading] Importing PuppeteerHelper from:', helperUrl.href);
        const module = await import(helperUrl.href);
        PuppeteerHelper = module.PuppeteerHelper;
        if (!PuppeteerHelper) {
          throw new Error('PuppeteerHelper not found in module');
        }
      } catch (importError) {
        console.error('[Module Loading] Failed to import PuppeteerHelper:', importError);
        throw new Error(`Failed to load PuppeteerHelper: ${importError instanceof Error ? importError.message : String(importError)}`);
      }

      const helper = new PuppeteerHelper(this.page);
      
      // Execute the script with only helper available
      const scriptFn = new Function('helper', `
        return (async () => {
          try {
            return ${script}
          } catch (error) {
            console.error('Error in automation script execution:', error);
            return { error: error.message };
          }
        })();
      `);
      
      const result = await Promise.resolve(scriptFn(helper));
      console.log('Function execution result:', result);
      
      return result;
    } catch (error: unknown) {
      console.error('Error executing Puppeteer script:', error);
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      return message;
    }
  }

  public async close() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        console.error('Error closing browser:', error);
      } finally {
        this.browser = null;
        this.page = null;
      }
    }
  }
}

export const puppeteerManager = PuppeteerManager.getInstance();
