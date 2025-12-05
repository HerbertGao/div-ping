# div-ping

![CI](https://github.com/HerbertGao/div-ping/workflows/CI/badge.svg)

Monitor changes to specific DOM elements on web pages, with notifications via browser alerts or webhooks.

## Features

- Visual element selection (hover to highlight)
- Multi-project management
- Background periodic monitoring
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
- ✅ Built-in security: SSRF protection, redirect blocking, header injection prevention

## FAQ

**Project save failed?** Reload the extension at `chrome://extensions/`

**Monitoring not working?** Check refresh interval and CSS selector validity

**Debugging:** `chrome://extensions/` → Service Worker to view logs

## Testing

```bash
npm test                 # Run tests
npm run test:coverage    # Generate coverage report
```

All 74 tests passing with comprehensive coverage for SSRF validation, variable replacement, storage operations, and i18n.

## Development TODO

### Medium Priority

- [ ] Dynamic permission requests - current `<all_urls>` permission is too broad
- [ ] Programmatic content script injection - avoid loading scripts on all pages
- [ ] Webhook rate limiting - prevent frequent triggering
- [ ] Error retry mechanism - automatic retry on network failures

### Low Priority

- [ ] Content length limits - prevent storage exhaustion

## License

MIT License
