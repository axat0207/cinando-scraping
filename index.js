import puppeteer from 'puppeteer';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid'; // You'll need to install this: npm install uuid
import {applyProductionCompanyFilter} from'./applyProductionFilter.js';

// Helper function to format time in hours, minutes, seconds
function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
}

// Helper function to clean text by removing excess whitespace and newlines
function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

// Add this helper function to handle cookie consent modal
async function handleCookieConsentModal(page) {
  console.log("Checking for cookie consent modal...");
  
  const cookieModalExists = await page.evaluate(() => {
    const cookieModal = document.querySelector('.modal-cookies-consent-accept-all');
    return !!cookieModal;
  });
  
  if (cookieModalExists) {
    console.log("Cookie consent modal found, accepting cookies...");
    await page.evaluate(() => {
      const acceptButton = document.querySelector('.modal-cookies-consent-accept-all');
      if (acceptButton) {
        acceptButton.click();
      }
    });
    
    // Wait for modal to disappear
    await new Promise(resolve => setTimeout(resolve, 2000));
    return true;
  }
  
  return false;
}

// Helper to get the current page number from the UI
async function getCurrentPageNumber(page) {
  return await page.evaluate(() => {
    // Try different methods to get the current page number
    
    // Method 1: From the active page indicator
    const activePage = document.querySelector('.page span.active');
    if (activePage) {
      const pageNum = parseInt(activePage.textContent.trim());
      if (!isNaN(pageNum)) return pageNum;
    }
    
    // Method 2: From the PageCurrent input if it exists
    const pageInput = document.querySelector('.PageCurrent');
    if (pageInput) {
      const pageNum = parseInt(pageInput.value);
      if (!isNaN(pageNum)) return pageNum;
    }
    
    // Method 3: From the URL if it contains a page parameter
    const url = window.location.href;
    const pageMatch = url.match(/[?&]page=(\d+)/i);
    if (pageMatch && pageMatch[1]) {
      return parseInt(pageMatch[1]);
    }
    
    // Default to page 1 if we can't determine
    return 1;
  });
}

async function goToNextPage(page, targetPage) {
  console.log(`Navigating to page ${targetPage}...`);
  
  try {
    // Check if we're on a company detail page
    const currentUrl = await page.url();
    console.log("Current URL:", currentUrl);
    
    // If we're on a company detail page, we need to go back to search results first
    if (currentUrl.includes('/Company/') || currentUrl.includes('/Detail')) {
      console.log("Currently on a company detail page, navigating back to search results...");
      await page.goto('https://cinando.com/en/Search/Companies', { waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 5000));
      await handleCookieConsentModal(page);
      
      // Make sure the filter is applied after returning to search page
      const isFilterApplied = await page.evaluate(() => {
        return document.body.textContent.includes('Production Company');
      });
      
      if (!isFilterApplied) {
        console.log("Re-applying Production Company filter after returning to search results...");
        await applyProductionCompanyFilter(page);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    // Now that we're on the search page, get the current page number
    const currentPage = await getCurrentPageNumber(page);
    console.log(`Currently on search results page ${currentPage}, need to go to page ${targetPage}`);
    
    // If we're already on the target page, no need to navigate
    if (currentPage === targetPage) {
      console.log(`Already on target page ${targetPage}`);
      return true;
    }
    
    // Use more direct "CLICK" method on the next button
    console.log("Using direct click method on the next button...");
    
    let attempts = 0;
    const maxAttempts = 5;
    let success = false;
    
    while (attempts < maxAttempts && !success) {
      attempts++;
      console.log(`Click attempt ${attempts}/${maxAttempts}...`);
      
      try {
        // First try to click using Puppeteer's built-in click method
        // Use a more specific selector for the next button
        const nextButtonSelector = '.pagi .number .page a.next';
        
        console.log(`Waiting for next button selector: ${nextButtonSelector}`);
        await page.waitForSelector(nextButtonSelector, { timeout: 10000 });
        
        console.log("Next button found, clicking it...");
        await page.click(nextButtonSelector);
        console.log("Next button clicked successfully using page.click()");
        
        // Wait for navigation
        try {
          console.log("Waiting for navigation after click...");
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
          console.log("Navigation completed successfully");
        } catch (navError) {
          console.log("Navigation timeout, but continuing anyway...");
        }
        
        // Check if we've moved to a new page
        await new Promise(resolve => setTimeout(resolve, 5000));
        const newPage = await getCurrentPageNumber(page);
        console.log(`After navigation, now on page ${newPage} (was on ${currentPage})`);
        
        if (newPage > currentPage) {
          console.log(`Successfully navigated from page ${currentPage} to page ${newPage}`);
          success = true;
          break;
        } else {
          console.log("Navigation didn't change the page number, trying again...");
        }
      } catch (clickError) {
        console.log(`Click attempt ${attempts} failed:`, clickError.message);
        
        // Try with evaluate as a fallback
        console.log("Trying with evaluate as fallback...");
        
        const nextButtonClicked = await page.evaluate(() => {
          try {
            console.log("Looking for next button inside page.evaluate()...");
            
            // Try multiple selectors to find the next button
            const selectors = [
              'html > body > div.website > div.page-search.page-search-company > div.container.container-content > div.row > div.content > div.search-lst > div.search-lst-filters > div.pull-right > div.pagi > div.number > div.page > a.next',
              '.pagi .number .page a.next',
              '.page a.next',
              'a.next'
            ];
            
            let button = null;
            for (const selector of selectors) {
              button = document.querySelector(selector);
              if (button) {
                console.log(`Found next button with selector: ${selector}`);
                break;
              }
            }
            
            if (!button) {
              console.log("Couldn't find next button with any selector");
              return false;
            }
            
            // Log button properties to debug
            console.log(`Button text: "${button.textContent.trim()}"`);
            console.log(`Button href: ${button.href}`);
            console.log(`Button visible: ${button.offsetParent !== null}`);
            
            // Use a stronger click approach
            console.log("Clicking next button with multiple events...");
            button.focus();
            button.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
            button.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
            button.dispatchEvent(new MouseEvent('click', {bubbles: true}));
            
            // If there's an href, navigate directly
            if (button.href) {
              console.log(`Using direct navigation to: ${button.href}`);
              window.location.href = button.href;
            }
            
            return true;
          } catch (e) {
            console.log("Error in evaluate click:", e.message);
            return false;
          }
        });
        
        console.log(`Next button clicked with evaluate: ${nextButtonClicked}`);
        
        // Wait regardless of click result
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        // Check if page changed
        const newPage = await getCurrentPageNumber(page);
        if (newPage > currentPage) {
          console.log(`Successfully navigated to page ${newPage} with evaluate method`);
          success = true;
          break;
        }
      }
      
      // If we're still here, navigation didn't work, try refreshing the page
      if (!success && attempts < maxAttempts) {
        console.log("Refreshing page before next attempt...");
        await page.reload({ waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 5000));
        await handleCookieConsentModal(page);
      }
    }
    
    // If all click attempts failed, try navigating to page 3 directly via URL
    if (!success) {
      console.log("All click attempts failed, trying direct navigation to the next page URL...");
      
      // Go directly to the page URL with any filters preserved
      const searchUrl = new URL('https://cinando.com/en/Search/Companies');
      searchUrl.searchParams.set('page', targetPage.toString());
      
      console.log(`Navigating directly to: ${searchUrl.toString()}`);
      await page.goto(searchUrl.toString(), { waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 5000));
      await handleCookieConsentModal(page);
      
      // Check if the filter needs to be reapplied
      const isFilterApplied = await page.evaluate(() => {
        return document.body.textContent.includes('Production Company');
      });
      
      if (!isFilterApplied) {
        console.log("Reapplying Production Company filter after direct navigation...");
        await applyProductionCompanyFilter(page);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    // Final verification that we're on the correct page
    const finalPage = await getCurrentPageNumber(page);
    console.log(`Final page check: Now on page ${finalPage} (target: ${targetPage})`);
    
    // Check that we have different companies than on the previous page
    const companyUrls = await page.evaluate(() => {
      const companies = Array.from(document.querySelectorAll('.item--author--name a'));
      return companies.map(a => a.href);
    });
    
    console.log(`Found ${companyUrls.length} company URLs on page ${finalPage}`);
    console.log(`First few companies: ${companyUrls.slice(0, 3).join(', ')}`);
    
    // Store these URLs to check for duplicates in the main processing loop
    global.previousPageCompanyUrls = companyUrls;
    
    if (companyUrls.length === 0) {
      console.error(`No companies found on page ${finalPage}`);
      return false;
    }
    
    return finalPage === targetPage;
  } catch (error) {
    console.error("Error in goToNextPage:", error.message);
    return false;
  }
}
async function navigateToStartPage(page, targetPage) {
  console.log(`Navigating to start page ${targetPage}...`);
  
  // First get the current page number
  let currentPage = await getCurrentPageNumber(page);
  console.log(`Current page is ${currentPage}, need to get to page ${targetPage}`);
  
  // If we're already on or past the target page, no need to navigate
  if (currentPage >= targetPage) {
    console.log(`Already on or past target page ${targetPage} (current: ${currentPage})`);
    return;
  }
  
  // Use our improved navigation function to go directly to the target page
  const navigationSuccess = await goToNextPage(page, targetPage);
  
  if (!navigationSuccess) {
    console.error(`Failed to navigate to start page ${targetPage}`);
    
    // As a last resort, try page-by-page navigation
    console.log("Trying page-by-page navigation as a last resort...");
    
    while (await getCurrentPageNumber(page) < targetPage) {
      const current = await getCurrentPageNumber(page);
      console.log(`On page ${current}, clicking next button...`);
      
      // Click the next button (using the most reliable selector)
      try {
        await page.click('.pagi .number .page a.next');
      } catch (e) {
        console.error("Failed to click next button:", e.message);
        break;
      }
      
      // Wait for navigation
      await new Promise(resolve => setTimeout(resolve, 5000));
      await handleCookieConsentModal(page);
      
      // Verify progress
      const newPage = await getCurrentPageNumber(page);
      if (newPage <= current) {
        console.error("Navigation appears stuck, unable to proceed");
        break;
      }
    }
  }
  
  // Final verification
  const finalPage = await getCurrentPageNumber(page);
  console.log(`Start page navigation complete, now on page ${finalPage}`);
}

async function scrapeCompaniesAndDetails(headlessMode = false, startPage, endPage) {
  // Start timing the entire process
  const totalStartTime = new Date();
  
  // Track unique URLs to avoid duplicates
  const processedUrls = new Set();
  
  // Launch with visible browser if headlessMode is false
  const browser = await puppeteer.launch({ 
    headless: headlessMode,
    defaultViewport: null,
    args: ['--no-sandbox'],
    ignoreDefaultArgs: ['--enable-automation'],
    executablePath: '/usr/bin/google-chrome' 
  });
  
  const page = await browser.newPage();
  
  // Set a longer default timeout
  page.setDefaultTimeout(120000);
  
  // Arrays to store company and staff data separately
  const companiesData = [];
  const staffData = [];
  
  // Track timing for each page
  const pageTiming = [];
  
  // Add metadata about the scraping session
  const metadata = {
    scrapingDate: new Date().toISOString(),
    pagesScraped: {
      from: startPage,
      to: endPage
    },
    filter: "Production Company"
  };
  
  // Load existing data if available to prevent starting from scratch in case of a restart
  try {
    if (fs.existsSync('Cinando_Production_Company.json')) {
      const existingData = JSON.parse(fs.readFileSync('Cinando_Production_Company.json', 'utf8'));
      companiesData.push(...existingData.companies);
      console.log(`Loaded ${companiesData.length} companies from existing JSON file`);
      
      // Add all processed URLs to the set
      companiesData.forEach(company => processedUrls.add(company.url));
      console.log(`Loaded ${processedUrls.size} unique URLs from existing data`);
    }
    
    if (fs.existsSync('Cinando_Staff.json')) {
      const existingStaffData = JSON.parse(fs.readFileSync('Cinando_Staff.json', 'utf8'));
      staffData.push(...existingStaffData.staff);
      console.log(`Loaded ${staffData.length} staff members from existing JSON file`);
    }
  } catch (error) {
    console.error("Error loading existing data:", error);
    // Continue with empty arrays if there's an error loading existing data
  }

  try {
    console.log("Opening website...");
    await page.goto('https://cinando.com/', { waitUntil: 'networkidle2' });
    
    // Check for cookie consent modal and handle it if present
    await handleCookieConsentModal(page);
    
    // Log in
    console.log("Entering login credentials...");
    await page.evaluate(() => {
      const emailInput = document.querySelector('#Email');
      const passwordInput = document.querySelector('#Password');
      
      if (emailInput) emailInput.value = 'singla.ankur@gmail.com';
      if (passwordInput) passwordInput.value = 'barsaati@101';
    });
    
    // Click login button
    console.log("Clicking login button...");
    await page.evaluate(() => {
      const loginButton = document.querySelector('.button[type="submit"]') || 
                          document.querySelector('button[type="submit"]') ||
                          document.querySelector('.button');
      if (loginButton) loginButton.click();
    });
    
    // Wait for navigation after login
    console.log("Waiting for navigation after login...");
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    } catch (e) {
      console.log("Navigation timeout, continuing...");
    }
    
    // Check for cookie modal after login
    await handleCookieConsentModal(page);
    
    // Navigate to the companies page
    console.log("Navigating to companies page...");
    await page.goto('https://cinando.com/en/Search/Companies', { waitUntil: 'networkidle2' });
    
    // Check for cookie modal after navigation
    await handleCookieConsentModal(page);
    
    // Ensure page is fully loaded
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Apply the Production Company filter only once at the beginning
    console.log("Applying Production Company filter once at the beginning...");
    await applyProductionCompanyFilter(page);
    
    // Now go to the start page
    if (startPage > 1) {
      await navigateToStartPage(page, startPage);
      await handleCookieConsentModal(page);
    }
    
    // Loop through pages within the specified range
    for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
      // Start timing this page
      const pageStartTime = new Date();
      
      console.log(`Processing page ${currentPage}...`);
      
      // Check if we need to navigate to a new page (only for pages after startPage)
      if (currentPage > startPage) {
        console.log(`Navigating from page ${currentPage - 1} to page ${currentPage}...`);
        
        // Use our improved navigation function with the target page number
        const navigationSuccess = await goToNextPage(page, currentPage);
        
        if (!navigationSuccess) {
          console.error(`Failed to navigate to page ${currentPage}, skipping...`);
          continue;
        }
      }
      
      // Wait for the content to load properly after pagination
      await page.waitForSelector('.item--author--name', { timeout: 30000 })
        .catch(err => console.log("Warning: Selector timeout, but continuing anyway"));
      
      // Extra wait to ensure all content is rendered
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Verify we're on the correct page
      const actualPage = await getCurrentPageNumber(page);
      
      if (actualPage !== currentPage) {
        console.log(`Warning: Expected to be on page ${currentPage}, but found page ${actualPage}`);
        console.log("Continuing with current page despite pagination issue");
      }
      
      // Scrape companies list on the current page
      console.log(`Scraping companies from page ${currentPage}...`);
      const companiesList = await scrapeCompanyList(page);

      console.log(`Scraped ${companiesList.length} companies from page ${currentPage}`);
      
      // If no companies were found, retry
      if (companiesList.length === 0) {
        console.error(`No companies found on page ${currentPage}. Retrying...`);
        
        // Try refreshing the page
        console.log("Refreshing the page...");
        await page.reload({ waitUntil: 'networkidle2' });
        
        // Check for cookie modal after page refresh
        await handleCookieConsentModal(page);
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Try scraping again
        const companiesRetry = await scrapeCompanyList(page);
        
        // If still no companies, skip this page
        if (companiesRetry.length === 0) {
          console.error(`Still no companies found on page ${currentPage} after refresh. Skipping page.`);
          continue;
        } else {
          console.log(`Found ${companiesRetry.length} companies after refresh.`);
          companiesList.push(...companiesRetry);
        }
      }
      
      // Process all companies on the page
      for (let i = 0; i < companiesList.length; i++) {
        const company = companiesList[i];
        console.log(`Processing company ${i + 1}/${companiesList.length} on page ${currentPage}: ${company.name}`);
        
        // Skip if we've already processed this URL
        if (processedUrls.has(company.url)) {
          console.log(`Skipping duplicate company: ${company.name} (${company.url})`);
          continue;
        }
        
        // Mark this URL as processed
        processedUrls.add(company.url);
        
        try {
          // Navigate to the company detail page
          console.log(`Navigating to: ${company.url}`);
          await page.goto(company.url, { waitUntil: 'networkidle2' });
          
          // Check for cookie modal after company page navigation
          await handleCookieConsentModal(page);
          
          // Wait for content to load
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Extract logo URL directly
          const logoUrlDebug = await page.evaluate(() => {
            const logoElement = document.querySelector('#summary .cover__info-cover .cover__info-cover-thumb img');
            if (logoElement && logoElement.src) {
              return logoElement.src;
            } else {
              const generalLogoElement = document.querySelector('.cover__info-cover-thumb img');
              if (generalLogoElement && generalLogoElement.src) {
                return generalLogoElement.src;
              }
              return null;
            }
          });
          
          // Extract staff images directly
          const staffDebugData = await page.evaluate(() => {
            const staffItems = document.querySelectorAll('#staff .list-staff .item');
            const data = [];
            
            staffItems.forEach((item, index) => {
              const name = item.querySelector('.item--name a')?.textContent.trim() || '';
              const imgSrc = item.querySelector('.item-thumb a img')?.src || 
                            item.querySelector('.item-thumb a img')?.getAttribute('data-src') || '';
              
              data.push({
                name,
                imgSrc
              });
            });
            
            return data;
          });
          
          // Scrape detailed company data
          const companyData = await page.evaluate(() => {
            const data = {
              name: '',
              activity: '',
              address: '',
              description: '',
              objective: '',
              contact_number: '',
              links: [],
              socialLinks: [],
              thumbnailLogoUrl: '',
              backgroundImageUrl: '',
              staff: []
            };
            
            // Get company name
            const titleElement = document.querySelector('.cover__large--title') || 
                                document.querySelector('.company-profile-header__title');
            if (titleElement) {
              data.name = titleElement.textContent.trim();
            }
            
            // Get company logo with multiple selector attempts
            // First try the exact path
            const specificLogoSelector = '#summary .cover__info-cover .cover__info-cover-thumb img';
            const logoElement = document.querySelector(specificLogoSelector);
            
            if (logoElement && logoElement.src) {
              data.thumbnailLogoUrl = logoElement.src;
            } else {
              // Try alternative selectors
              const alternativeSelectors = [
                '.cover__info-cover-thumb img',
                '.cover__large .cover__info-cover .cover__info-cover-thumb img',
                '.cover__info-cover img',
                '.company-profile-header__logo-img',
                '.cover__large--image img'
              ];
              
              for (const selector of alternativeSelectors) {
                const altLogo = document.querySelector(selector);
                if (altLogo && altLogo.src) {
                  data.thumbnailLogoUrl = altLogo.src;
                  break;
                }
              }
            }
            
            // Get background image
            const backgroundImageElement = document.querySelector('.cover__large > img');
            if (backgroundImageElement && backgroundImageElement.src) {
              data.backgroundImageUrl = backgroundImageElement.src;
            }
            
            // Get activity information
            const activityElement = document.querySelector('.members');
            if (activityElement) {
              // Get all activity items as a clean array
              const activities = [];
              
              // Handle different possible structures
              if (activityElement.querySelectorAll('.label-info').length > 0) {
                // If there are specific activity elements, use those
                activityElement.querySelectorAll('.label-info').forEach(act => {
                  const actText = act.textContent.trim();
                  if (actText) activities.push(actText);
                });
              } else {
                // Otherwise, split by commas or clean up the text
                const activityText = activityElement.textContent.trim()
                                    .replace('Activity', '')
                                    .trim();
                                    
                // Split by clear separators or just clean up newlines
                const splitActs = activityText.includes(',') 
                  ? activityText.split(',').map(a => a.trim()).filter(a => a)
                  : activityText.replace(/\s+/g, ' ').trim().split(/\s{2,}/)
                      .map(a => a.trim()).filter(a => a);
                
                activities.push(...splitActs);
              }
              
              // Join back with commas for a clean result
              data.activity = activities.join(', ');
            }
            
            // Get company contact number
            const phoneElement = document.querySelector('.address .phone');
            if (phoneElement) {
              data.contact_number = phoneElement.textContent.trim();
            }
            
            // Get company address without the phone number
            const addressElement = document.querySelector('.address');
            if (addressElement) {
              // Create a clone to manipulate
              const addressClone = addressElement.cloneNode(true);
              
              // Remove phone element from clone if exists
              const phoneInAddress = addressClone.querySelector('.phone');
              if (phoneInAddress) {
                phoneInAddress.remove();
              }
              
              // Now get text without the phone
              let addressText = addressClone.textContent.trim();
              
              // Remove "Information" label if it exists
              addressText = addressText.replace('Information', '').trim();
              
              // Extract any phone number pattern from the end of the address and put it in contact_number
              const phonePattern = /\s+(\+?\d+[\s\d]+\d+)\s*$/;
              const phoneMatch = addressText.match(phonePattern);
              
              if (phoneMatch && phoneMatch[1]) {
                // If we found a phone number at the end, add it to contact_number and remove from address
                if (!data.contact_number) {
                  data.contact_number = phoneMatch[1].trim();
                }
                addressText = addressText.replace(phonePattern, '');
              }
              
              // Clean remaining whitespace and newlines
              data.address = addressText.replace(/\s+/g, ' ').trim();
            }
            
            // Get company description
            const descriptionElements = document.querySelectorAll('.box.box--gray.grey-desc p');
            if (descriptionElements.length > 0) {
              // First p tag is usually the description
              const descText = descriptionElements[0].textContent.trim();
              data.description = descText.replace(/\s+/g, ' ').trim();
              
              // If there's a second p tag, it's the objective
              if (descriptionElements.length > 1) {
                const objText = descriptionElements[1].textContent.trim();
                data.objective = objText.replace(/\s+/g, ' ').trim();
              }
            }
            
            // Get company links and contacts (only text)
            const linksElements = document.querySelectorAll('.links a');
            linksElements.forEach(link => {
              const linkText = link.textContent.trim() || '';
              if (linkText) {
                data.links.push(linkText);
              }
              
              // Also get href if available
              if (link.href && link.href.startsWith('http')) {
                // Add only if not already in links
                if (!data.links.includes(link.href)) {
                  data.links.push(link.href);
                }
              }
            });
            
            // Get social media links
            const socialElements = document.querySelectorAll('.socials a');
            socialElements.forEach(social => {
              if (social.href && social.href.startsWith('http')) {
                data.socialLinks.push({
                  url: social.href,
                  type: getNetworkType(social.href)
                });
              }
            });
            
            // Helper function to identify social network type
            function getNetworkType(url) {
              const lowerUrl = url.toLowerCase();
              if (lowerUrl.includes('facebook')) return 'facebook';
              if (lowerUrl.includes('twitter') || lowerUrl.includes('x.com')) return 'twitter';
              if (lowerUrl.includes('instagram')) return 'instagram';
              if (lowerUrl.includes('linkedin')) return 'linkedin';
              if (lowerUrl.includes('youtube')) return 'youtube';
              if (lowerUrl.includes('vimeo')) return 'vimeo';
              return 'other';
            }
            
            // Get additional information fields
            const infoElements = document.querySelectorAll('.company-info__item');
            infoElements.forEach(item => {
              const label = item.querySelector('.company-info__label')?.textContent.trim() || '';
              const value = item.querySelector('.company-info__data')?.textContent.trim() || '';
              if (label && value) {
                const cleanLabel = label.replace(':', '').trim().toLowerCase();
                // Add directly to data object with clean value
                data[cleanLabel] = value.replace(/\s+/g, ' ').trim();
              }
            });
            
            // Get staff details
            const staffItems = document.querySelectorAll('#staff .list-staff .item');
            
            if (staffItems && staffItems.length > 0) {
              staffItems.forEach((staffElement, index) => {
                try {
                  const staff = {
                    name: '',
                    profileLink: '',
                    role: '',
                    phone: '',
                    mobile: '',
                    email: '',
                    imageUrl: ''
                    // Removed socialLinks as requested
                  };
                  
                  // Get name and profile link
                  const nameElement = staffElement.querySelector('.item--name a');
                  if (nameElement) {
                    staff.name = nameElement.textContent.trim();
                    staff.profileLink = nameElement.href;
                  }
                  
                  // Get staff profile image using exact selector path
                  const imgElement = staffElement.querySelector('.item__wrapper .item-thumb a img');
                  
                  if (imgElement) {
                    staff.imageUrl = imgElement.src || imgElement.getAttribute('data-src') || '';
                  } else {
                    // Try alternative selector as fallback
                    const altImgElement = staffElement.querySelector('img');
                    if (altImgElement) {
                      staff.imageUrl = altImgElement.src || altImgElement.getAttribute('data-src') || '';
                    }
                  }
                  
                  // Get role/function
                  const functionElement = staffElement.querySelector('.item--function');
                  if (functionElement) {
                    staff.role = functionElement.textContent.trim();
                  }
                  
                  // Get phone
                  const telElement = staffElement.querySelector('.tel.tel-people');
                  if (telElement) {
                    staff.phone = telElement.textContent.trim();
                  }
                  
                  // Get mobile
                  const mobileElement = staffElement.querySelector('.mobile.mobile-people');
                  if (mobileElement && mobileElement.textContent.trim()) {
                    staff.mobile = mobileElement.textContent.trim();
                  }
                  
                  // Get email with better selector
                  const emailElement = staffElement.querySelector('ul.item-links li.mail a') || 
                                       staffElement.querySelector('a[href^="mailto:"]');
                                      
                  if (emailElement) {
                    staff.email = emailElement.href.replace('mailto:', '');
                  }
                  
                  // Only add staff if we have at least a name
                  if (staff.name) {
                    data.staff.push(staff);
                  }
                } catch (e) {
                  console.log('Error processing staff member');
                }
              });
            }
            
            return data;
          });
          
          // If logo wasn't found in the main extraction but was found in the debug extraction,
          // use the debug result
          if (!companyData.thumbnailLogoUrl && logoUrlDebug) {
            companyData.thumbnailLogoUrl = logoUrlDebug;
          }
          
          // Update staff data with debug data if needed
          if (staffDebugData && staffDebugData.length > 0 && companyData.staff && companyData.staff.length > 0) {
            // Create a map of staff names to debug data
            const staffDebugMap = new Map();
            staffDebugData.forEach(staffDebug => {
              if (staffDebug.name) {
                staffDebugMap.set(staffDebug.name, staffDebug);
              }
            });
            
            // Update staff data
            companyData.staff.forEach(staff => {
              const debugData = staffDebugMap.get(staff.name);
              if (debugData) {
                // Use debug image if main extraction failed
                if (!staff.imageUrl && debugData.imgSrc) {
                  staff.imageUrl = debugData.imgSrc;
                }
              }
            });
          }
          
          // Extra direct DOM extraction as a last resort if needed
          if (!companyData.thumbnailLogoUrl || companyData.staff.some(s => !s.imageUrl)) {
            const lastResortData = await page.evaluate(() => {
              const result = { logoUrl: null, staffData: [] };
              
              // Try to find any image within the company profile header
              if (!document.querySelector('.cover__info-cover-thumb img')?.src) {
                const allHeaderImages = document.querySelectorAll('.cover__info-cover img, .cover__large img');
                if (allHeaderImages.length > 0) {
                  result.logoUrl = allHeaderImages[0].src;
                }
              }
              
              // Get all staff data as a last resort
              const staffItems = document.querySelectorAll('#staff .list-staff .item');
              staffItems.forEach((item, idx) => {
                const name = item.querySelector('.item--name a')?.textContent.trim();
                const imgElement = item.querySelector('img');
                const imgSrc = imgElement ? (imgElement.src || imgElement.getAttribute('data-src')) : null;
                
                if (name) {
                  result.staffData.push({ name, imgSrc });
                }
              });
              
              return result;
            });
            
            // Apply last resort data if needed
            if (!companyData.thumbnailLogoUrl && lastResortData.logoUrl) {
              companyData.thumbnailLogoUrl = lastResortData.logoUrl;
            }
            
            // Update staff data from last resort
            if (lastResortData.staffData && lastResortData.staffData.length > 0) {
              const staffMap = new Map();
              lastResortData.staffData.forEach(s => {
                if (s.name) staffMap.set(s.name, s);
              });
              
              companyData.staff.forEach(staff => {
                const lastResortStaff = staffMap.get(staff.name);
                if (lastResortStaff) {
                  // Add image if missing
                  if (!staff.imageUrl && lastResortStaff.imgSrc) {
                    staff.imageUrl = lastResortStaff.imgSrc;
                  }
                }
              });
            }
          }
          
          // Stronger check to ensure we only keep Production Companies
          const isProductionCompany = (() => {
            // Check activity field
            if (companyData.activity) {
              const activity = companyData.activity.toLowerCase();
              if (
                activity.includes('production company') || 
                activity.includes('prod') || 
                (activity.includes('production') && !activity.includes('post')) // avoid post-production
              ) {
                return true;
              }
            }
            
            // Check company name as fallback
            if (companyData.name) {
              const name = companyData.name.toLowerCase();
              if (
                name.includes('production') && 
                !name.includes('post-production') && 
                !name.includes('post production')
              ) {
                return true;
              }
            }
            
            return false;
          })();

          if (!isProductionCompany) {
            console.log(`Skipping non-production company: ${companyData.name}`);
            continue;
          }
          
          // Generate a unique ID for the company
          const companyId = uuidv4();
          
          // Create a clean company object for the companies.json file
          const cleanCompany = {
            id: companyId,
            name: companyData.name,
            url: company.url,
            thumbnailLogoUrl: companyData.thumbnailLogoUrl,
            backgroundImageUrl: companyData.backgroundImageUrl,
            activity: companyData.activity || '',
            address: companyData.address,
            contact_number: companyData.contact_number || '',
            description: companyData.description,
            objective: companyData.objective || '',
            links: companyData.links,
            socialLinks: companyData.socialLinks,
            pageScraped: currentPage
          };
          
          // Add other properties directly
          for (const [key, value] of Object.entries(companyData)) {
            // Skip properties that are already handled
            if (!['name', 'activity', 'address', 'contact_number', 'description', 'objective', 'links', 
                 'socialLinks', 'thumbnailLogoUrl', 'backgroundImageUrl', 'staff'].includes(key)) {
              cleanCompany[key] = value;
            }
          }
          
          // Add the company to our companies array
          companiesData.push(cleanCompany);
          
          // Process staff members
          if (companyData.staff && companyData.staff.length > 0) {
            companyData.staff.forEach(staffMember => {
              const staffId = uuidv4();
              staffData.push({
                id: staffId,
                name: staffMember.name,
                companyId: companyId,
                companyName: companyData.name,
                profileLink: staffMember.profileLink,
                imageUrl: staffMember.imageUrl,
                role: staffMember.role,
                phone: staffMember.phone,
                mobile: staffMember.mobile,
                email: staffMember.email,
                // Removed socialLinks as requested
                pageScraped: currentPage
              });
            });
          }
          
          console.log(`Successfully processed production company: ${company.name}`);
          console.log(`Staff members found: ${companyData.staff ? companyData.staff.length : 0}`);
          
          // Save data after each company processed
          saveData(companiesData, staffData, metadata, currentPage, endPage, pageTiming);
          console.log(`Saved data after processing company: ${company.name}`);
          
          // Small delay to prevent hammering the server
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`Error processing company ${company.name}:`, error);
          // Continue with next company
        }
      }
      
      // Calculate time taken for this page
      const pageEndTime = new Date();
      const pageTimeTaken = pageEndTime - pageStartTime;
      const formattedPageTime = formatTime(pageTimeTaken);
      
      // Add to timing array
      pageTiming.push({
        page: currentPage,
        startTime: pageStartTime.toISOString(),
        endTime: pageEndTime.toISOString(),
        timeTaken: pageTimeTaken,
        formattedTime: formattedPageTime,
        companiesScraped: companiesList.length
      });
      
      console.log(`Page ${currentPage} completed in ${formattedPageTime}`);
      console.log(`Processed ${companiesList.length} companies on this page`);
      
      // Save the data after the entire page is done
      saveData(companiesData, staffData, metadata, currentPage, endPage, pageTiming);
      
      console.log(`Completed page ${currentPage}`);
    }
    
    // Calculate total time for entire process
    const totalEndTime = new Date();
    const totalTimeTaken = totalEndTime - totalStartTime;
    const formattedTotalTime = formatTime(totalTimeTaken);
    
    console.log(`All data scraped successfully in ${formattedTotalTime}!`);
    console.log("Page by page timing:");
    pageTiming.forEach(timing => {
      console.log(`- Page ${timing.page}: ${timing.formattedTime} (${timing.companiesScraped} companies)`);
    });
    
    // Calculate average time per page
    const totalPages = pageTiming.length;
    if (totalPages > 0) {
      const avgTimePerPage = totalTimeTaken / totalPages;
      console.log(`Average time per page: ${formatTime(avgTimePerPage)}`);
    }
    
    return { 
      metadata: {
        ...metadata,
        totalCompanies: companiesData.length,
        totalStaff: staffData.length,
        totalUniqueUrls: processedUrls.size,
        timing: {
          startTime: totalStartTime.toISOString(),
          endTime: totalEndTime.toISOString(),
          totalTime: totalTimeTaken,
          formattedTotalTime: formattedTotalTime,
          pageTiming: pageTiming
        }
      },
      companies: companiesData, 
      staff: staffData 
    };

  } catch (error) {
    console.error("Error during scraping:", error);
    
    // Calculate partial time
    const totalEndTime = new Date();
    const totalTimeTaken = totalEndTime - totalStartTime;
    const formattedTotalTime = formatTime(totalTimeTaken);
    
    console.log(`Process failed after running for ${formattedTotalTime}`);
    
    // Save what we have so far in case of error
    console.log("Saving partial data before exit due to error...");
    saveData(companiesData, staffData, {
      ...metadata,
      timing: {
        startTime: totalStartTime.toISOString(),
        endTime: totalEndTime.toISOString(),
        totalTime: totalTimeTaken,
        formattedTotalTime: formattedTotalTime,
        pageTiming: pageTiming
      }
    }, -1, endPage, pageTiming, true);
    
    throw error;
  } finally {
    console.log("Closing browser...");
    await browser.close();
  }
}

// Scrape the list of companies from the current page
async function scrapeCompanyList(page) {
  return await page.evaluate(() => {
    const results = [];
    
    // Find all author elements
    const authorElements = document.querySelectorAll('.item--author--name');
    console.log(`Found ${authorElements.length} company elements`);
    
    // Try to get company logo URLs
    const itemElements = document.querySelectorAll('.item.item-comp');
    
    authorElements.forEach((element, index) => {
      try {
        // Get the link inside this element
        const linkElement = element.querySelector('a');
        
        if (linkElement) {
          const company = {
            name: linkElement.textContent.trim(),
            url: linkElement.href,
            title: linkElement.getAttribute('title') || '',
            logoUrl: ''
          };
          
          // Try to find the corresponding logo image
          // Get parent item to find the logo
          if (itemElements[index]) {
            const imgElement = itemElements[index].querySelector('.item-thumb-wrapper img');
            if (imgElement && imgElement.src) {
              company.logoUrl = imgElement.src;
            }
          }
          
          results.push(company);
        }
      } catch (e) {
        console.log(`Error processing element ${index}:`, e.message);
      }
    });
    
    return results;
  });
}

// Save the scraped data to JSON files
// Save the scraped data to JSON files
function saveData(companiesData, staffData, metadata, currentPage, totalPages, pageTiming, isError = false) {
  const filename = isError ? '_partial' : '';
  
  // Flatten the socialLinks before saving
  const companiesWithFlattenedSocialLinks = companiesData.map(company => {
    if (company.socialLinks && Array.isArray(company.socialLinks)) {
      // Convert the array of objects to a simple array of URLs
      const flattenedLinks = company.socialLinks.map(link => link.url);
      return {
        ...company,
        socialLinks: flattenedLinks
      };
    }
    return company;
  });
  
  const companiesOutput = {
    metadata: {
      ...metadata,
      totalCompanies: companiesWithFlattenedSocialLinks.length,
      currentProgress: `${currentPage}/${totalPages}`,
      timing: pageTiming
    },
    companies: companiesWithFlattenedSocialLinks
  };
  
  const staffOutput = {
    metadata: {
      ...metadata,
      totalStaff: staffData.length,
      totalCompanies: companiesData.length,
      currentProgress: `${currentPage}/${totalPages}`,
      timing: pageTiming
    },
    staff: staffData
  };
  
  fs.writeFileSync(`Cinando_Production_Company${filename}.json`, JSON.stringify(companiesOutput, null, 2));
  fs.writeFileSync(`Cinando_Staff${filename}.json`, JSON.stringify(staffOutput, null, 2));
  
  if (currentPage > 0) {
    console.log(`Data saved at progress: ${currentPage}/${totalPages}`);
  } else {
    console.log(`Data saved (partial due to error)`);
  }
}

(async () => {
  try {
    const headlessMode = false;
    const startPage = 7; // Start scraping from page 2
    const endPage = 10;   // End scraping at page 3
    
    const result = await scrapeCompaniesAndDetails(headlessMode, startPage, endPage);
    
    console.log("Scraping completed successfully");
    console.log(`Scraped pages ${result.metadata.pagesScraped.from} to ${result.metadata.pagesScraped.to}`);
    console.log(`Total time: ${result.metadata.timing.formattedTotalTime}`);
    console.log(`Processed ${result.metadata.totalCompanies} unique production companies in total`);
    console.log(`Processed ${result.metadata.totalStaff} staff members in total`);
    
    // Display timing stats
    console.log("\nTiming Statistics:");
    console.log("=================");
    result.metadata.timing.pageTiming.forEach(timing => {
      console.log(`Page ${timing.page}: ${timing.formattedTime} (${timing.companiesScraped} companies)`);
    });
    
    // Calculate and display average time per page
    const avgTimePerPage = result.metadata.timing.totalTime / result.metadata.timing.pageTiming.length;
    console.log(`\nAverage time per page: ${formatTime(avgTimePerPage)}`);
    
    // If we have multiple pages, find the fastest and slowest
    if (result.metadata.timing.pageTiming.length > 1) {
      const fastest = [...result.metadata.timing.pageTiming].sort((a, b) => a.timeTaken - b.timeTaken)[0];
      const slowest = [...result.metadata.timing.pageTiming].sort((a, b) => b.timeTaken - a.timeTaken)[0];
      
      console.log(`Fastest page: Page ${fastest.page} (${fastest.formattedTime})`);
      console.log(`Slowest page: Page ${slowest.page} (${slowest.formattedTime})`);
    }
    
  } catch (error) {
    console.error("Script failed:", error);
  }
})();