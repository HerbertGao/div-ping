// Offscreen document for fetching page content without visible tabs
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fetchContent') {
    fetchContent(message.url, message.selector)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
});

async function fetchContent(url, selector) {
  try {
    // Create an iframe to load the page
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';

    // Wait for iframe to load
    const loadPromise = new Promise((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error('Failed to load page'));

      // Timeout after 30 seconds
      setTimeout(() => reject(new Error('Page load timeout')), 30000);
    });

    document.body.appendChild(iframe);
    iframe.src = url;

    await loadPromise;

    // Get content from iframe
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    const element = iframeDoc.querySelector(selector);

    if (!element) {
      document.body.removeChild(iframe);
      return { success: false, error: 'Element not found' };
    }

    const content = element.innerText || element.textContent || element.innerHTML;

    // Clean up
    document.body.removeChild(iframe);

    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
