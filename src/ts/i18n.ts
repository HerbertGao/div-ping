/**
 * I18n utility module for Chrome Extension
 * Provides internationalization support using Chrome's i18n API
 */

/**
 * Get translated message by key
 * @param key - Message key from messages.json
 * @param substitutions - Optional substitution values
 * @returns Translated message string
 */
export function t(key: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

/**
 * Initialize i18n for HTML pages
 * Replaces all elements with data-i18n attribute with translated text
 */
export function initI18nForHTML(): void {
  // Replace text content
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n');
    if (key) {
      element.textContent = t(key);
    }
  });

  // Replace placeholder attributes
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    const key = element.getAttribute('data-i18n-placeholder');
    if (key && element instanceof HTMLInputElement) {
      element.placeholder = t(key);
    }
  });

  // Replace title attributes
  document.querySelectorAll('[data-i18n-title]').forEach((element) => {
    const key = element.getAttribute('data-i18n-title');
    if (key) {
      element.setAttribute('title', t(key));
    }
  });

  // Replace value attributes (for buttons)
  document.querySelectorAll('[data-i18n-value]').forEach((element) => {
    const key = element.getAttribute('data-i18n-value');
    if (key && element instanceof HTMLInputElement) {
      element.value = t(key);
    }
  });
}

/**
 * Get current browser language
 * @returns Language code (e.g., 'zh_CN', 'en')
 */
export function getCurrentLanguage(): string {
  return chrome.i18n.getUILanguage();
}

/**
 * Get accepted languages
 * @returns Promise with array of language codes
 */
export async function getAcceptLanguages(): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.i18n.getAcceptLanguages((languages) => {
      resolve(languages);
    });
  });
}