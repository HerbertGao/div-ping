# div-ping

![CI](https://github.com/HerbertGao/div-ping/workflows/CI/badge.svg)

Monitor changes to specific DOM elements on web pages, with notifications via browser alerts or webhooks.

## Features

- Visual element selection (hover to highlight)
- Multi-project management
- Background periodic monitoring
- Configurable page load delay for Ajax/async content
- Browser notifications + Webhook notifications
- Complete logging system
- Data import/export

## Installation

1. Open Chrome browser and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked extension"
4. Select the `div-ping` folder

## Usage

1. Open the web page you want to monitor
2. Click the extension icon
3. Click "Select Element"
4. Select the element to monitor
5. Configure monitoring parameters and save

## Webhook Configuration

Supported variables: `{{projectName}}`, `{{url}}`, `{{selector}}`, `{{oldContent}}`, `{{newContent}}`, `{{timestamp}}`

### Examples

**GET Request:**

```text
https://api.example.com/notify?name={{projectName}}&content={{newContent}}
```

**POST Request:**

```json
{
  "text": "{{projectName}} change detected: {{newContent}}"
}
```

### Important Notes

- ⚠️ Variables in JSON templates should **not** be quoted: `{"msg": {{content}}}` ✓  `{"msg": "{{content}}"}`  ✗
- ⚠️ Minimum monitoring interval: 60 seconds (Chrome Alarms API limitation)
- ⏱️ Page load delay: 0-60 seconds (for Ajax/async content, adds to total check time)
- ✅ Built-in security: SSRF protection, redirect blocking, header injection prevention

## FAQ

**Project save failed?** Reload the extension at `chrome://extensions/`

**Monitoring not working?** Check refresh interval and CSS selector validity

**Element shows empty content?** Try adding a page load delay (0.5-5 seconds) for Ajax/async content

**Debugging:** `chrome://extensions/` → Service Worker to view logs

## Testing

```bash
npm test                 # Run tests
npm run test:coverage    # Generate coverage report
```

All 219 tests passing with comprehensive coverage for SSRF validation, variable replacement, storage operations, i18n, race conditions, tab cache, webhook rate limiting, load delay validation, and edge cases.

## License

MIT License
