
export const applyProductionCompanyFilter = async function (page) {
  console.log("Applying Production Company (PROD) filter...");
  
  try {
    // Make sure we're on the right page
    const url = await page.url();
    if (!url.includes('/Search/Companies')) {
      console.log("Not on companies search page, navigating there...");
      await page.goto('https://cinando.com/en/Search/Companies', { waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Reset the filter form first - clear any existing filters
    await page.evaluate(() => {
      const resetButton = document.querySelector('.form-row .button.button--reset');
      if (resetButton) {
        console.log("Clicking reset button to clear filters...");
        resetButton.click();
      }
    });
    
    // Wait for reset to take effect
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Try a different approach using direct select element manipulation
    const productionSelected = await page.evaluate(() => {
      try {
        // Get the original select element
        const selectElement = document.querySelector('#SelectCompanyActivity');
        if (!selectElement) {
          console.log("Original select element not found");
          return false;
        }
        
        console.log(`Select element has ${selectElement.options.length} options`);
        
        // Find the Production Company option
        let productionOptionIndex = -1;
        for (let i = 0; i < selectElement.options.length; i++) {
          const optionText = selectElement.options[i].text;
          console.log(`Option ${i}: ${optionText}`);
          
          if (optionText.includes('Production Company')) {
            productionOptionIndex = i;
            console.log(`Found Production Company option at index ${i}`);
            break;
          }
        }
        
        if (productionOptionIndex === -1) {
          console.log("Production Company option not found in the select element");
          return false;
        }
        
        // Select the Production Company option directly in the original select
        selectElement.selectedIndex = productionOptionIndex;
        
        // Trigger change events
        const event = new Event('change', { bubbles: true });
        selectElement.dispatchEvent(event);
        
        console.log(`Selected option index ${productionOptionIndex} in the original select`);
        
        // Now check if the chosen plugin has updated
        const chosenElement = document.querySelector('#SelectCompanyActivity_chosen .chosen-single span');
        if (chosenElement) {
          console.log(`Chosen element now displays: ${chosenElement.textContent}`);
        }
        
        return true;
      } catch (e) {
        console.log("Error in direct select manipulation:", e.message);
        return false;
      }
    });
    
    if (!productionSelected) {
      console.log("Direct select manipulation failed, trying alternative method with chosen dropdown");
      
      // Ensure the filter section is expanded
      await page.evaluate(() => {
        // Try to expand the form row if it's not already expanded
        const formRow = document.querySelector('.form-row.extend:not(.extend--opened)');
        if (formRow) {
          console.log("Expanding filter section...");
          formRow.click();
        }
      });
      
      // Wait for expansion
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Click to open the dropdown
      await page.evaluate(() => {
        const dropdown = document.querySelector('#SelectCompanyActivity_chosen');
        if (dropdown) {
          console.log("Clicking dropdown to open it");
          dropdown.click();
        } else {
          console.log("Dropdown element not found");
        }
      });
      
      // Wait for dropdown to open
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Now try to click option 17 directly
      const optionClicked = await page.evaluate(() => {
        try {
          // Get all options
          const options = document.querySelectorAll('#SelectCompanyActivity_chosen .chosen-results li');
          console.log(`Found ${options.length} options in dropdown`);
          
          // Log all options
          options.forEach((opt, i) => {
            console.log(`Option ${i}: ${opt.textContent.trim()}`);
          });
          
          // Find "Production Company (PROD)" option
          let targetOption = null;
          
          for (let i = 0; i < options.length; i++) {
            const optText = options[i].textContent.trim();
            if (optText.includes('Production Company')) {
              targetOption = options[i];
              console.log(`Found target option: ${optText}`);
              break;
            }
          }
          
          if (!targetOption) {
            console.log("Target option not found, trying by index 17");
            if (options.length > 17) {
              targetOption = options[17];
              console.log(`Using index 17 option: ${targetOption.textContent.trim()}`);
            }
          }
          
          if (targetOption) {
            // Scroll the option into view
            targetOption.scrollIntoView();
            
            // Click the option
            console.log("Clicking the target option");
            targetOption.click();
            
            return true;
          } else {
            console.log("No suitable option found");
            return false;
          }
        } catch (e) {
          console.log("Error clicking option:", e.message);
          return false;
        }
      });
      
      if (!optionClicked) {
        console.log("Failed to click option, trying one more approach with mousedown event");
        
        // Try with a mousedown event which might be more reliable
        await page.evaluate(() => {
          try {
            const option = document.querySelector('#SelectCompanyActivity_chosen .chosen-results li:nth-child(18)');
            if (option) {
              console.log(`Trying mousedown event on: ${option.textContent.trim()}`);
              
              // Create and dispatch mousedown event
              const mouseEvent = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window
              });
              
              option.dispatchEvent(mouseEvent);
              return true;
            }
            return false;
          } catch (e) {
            console.log("Error in mousedown event:", e.message);
            return false;
          }
        });
      }
    }
    
    // Wait for a moment to let any changes take effect
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check if we have a selected option
    const selectionConfirmed = await page.evaluate(() => {
      // Check for selected options in the chosen plugin
      const chosenSelections = document.querySelectorAll('#SelectCompanyActivity_chosen .chosen-choices .search-choice');
      
      if (chosenSelections.length > 0) {
        chosenSelections.forEach(sel => {
          console.log(`Selection confirmed: ${sel.textContent.trim()}`);
        });
        return true;
      }
      
      // Check if the chosen single selection shows Production
      const singleSelection = document.querySelector('#SelectCompanyActivity_chosen .chosen-single span');
      if (singleSelection && singleSelection.textContent.includes('Production')) {
        console.log(`Single selection confirmed: ${singleSelection.textContent.trim()}`);
        return true;
      }
      
      // Check the original select as a last resort
      const originalSelect = document.querySelector('#SelectCompanyActivity');
      if (originalSelect && originalSelect.options[originalSelect.selectedIndex]) {
        const selectedText = originalSelect.options[originalSelect.selectedIndex].text;
        console.log(`Original select shows: ${selectedText}`);
        return selectedText.includes('Production');
      }
      
      return false;
    });
    
    console.log(`Selection confirmed: ${selectionConfirmed}`);
    
    // Click the search/apply button
    const searchClicked = await page.evaluate(() => {
      // Find all buttons on the page and try to identify the search button
      const buttons = document.querySelectorAll('button');
      console.log(`Found ${buttons.length} buttons on the page`);
      
      buttons.forEach((btn, i) => {
        console.log(`Button ${i}: ${btn.textContent.trim()}, class: ${btn.className}`);
      });
      
      // Try various selectors for the search button
      const searchSelectors = [
        'button.btn-primary', 
        'button.button--submit',
        'button[type="submit"]',
        '.button--submit'
      ];
      
      for (const selector of searchSelectors) {
        const searchButton = document.querySelector(selector);
        if (searchButton) {
          console.log(`Found search button with selector "${selector}": ${searchButton.textContent.trim()}`);
          searchButton.click();
          return true;
        }
      }
      
      // If no specific search button found, try to find a button with "Search" or similar text
      for (const btn of buttons) {
        const text = btn.textContent.trim().toLowerCase();
        if (text.includes('search') || text.includes('submit') || text.includes('apply') || text.includes('filter')) {
          console.log(`Clicking button with text: ${btn.textContent.trim()}`);
          btn.click();
          return true;
        }
      }
      
      console.log("No search button found");
      return false;
    });
    
    console.log(`Search button clicked: ${searchClicked}`);
    
    // Wait for navigation
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    } catch (e) {
      console.log("Navigation timeout, continuing anyway");
    }
    
    // After search, verify we have results and they appear to be filtered
    const resultsVerified = await page.evaluate(() => {
      // Check if we have company results
      const companyElements = document.querySelectorAll('.item--author--name');
      console.log(`Found ${companyElements.length} company results`);
      
      // Look for a filter indicator
      const filterIndicators = document.querySelectorAll('.filter.with-close');
      if (filterIndicators.length > 0) {
        filterIndicators.forEach(fi => {
          console.log(`Filter applied: ${fi.textContent.trim()}`);
        });
        return true;
      }
      
      return companyElements.length > 0; // At least we have results
    });
    
    console.log(`Results verified: ${resultsVerified}`);
    
    return true;
  } catch (error) {
    console.error("Error applying Production Company filter:", error);
    
    // If all else fails, just try to continue without a filter
    // We'll rely on post-filtering in the scraping logic
    return false;
  }
}