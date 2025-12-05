# Claude Code Guidelines for div-ping

This file contains project-specific guidelines for Claude Code when working with this codebase.

## Documentation Standards

### README Files

**Important**: Keep README files concise and high-level. Avoid excessive detail.

- ✅ **DO**: Provide brief, high-level descriptions
- ✅ **DO**: Include essential setup and usage instructions
- ✅ **DO**: Link to external documentation when needed
- ❌ **DON'T**: Add verbose technical details
- ❌ **DON'T**: Include extensive API documentation
- ❌ **DON'T**: Add detailed implementation explanations

**Example of excessive detail to avoid**:
```markdown
## Testing

The project includes comprehensive unit tests for critical functionality.

### Run Tests

```bash
npm test
npm run test:watch
npm run test:coverage
```

### Test Coverage (TOO DETAILED - AVOID THIS)

Current test coverage includes:

- **SSRF Protection**: Validates webhook URLs against various attack vectors
  - Protocol validation (blocking file://, ftp://, javascript:, data:)
  - Localhost blocking (127.0.0.1, localhost, *.localhost)
  - Internal domain blocking (*.local, *.internal)
  - Private IP ranges (RFC 1918, link-local, etc.)

- **Variable Replacement**: Tests all three replacement contexts
  - URL parameters (with URL encoding)
  - HTTP headers (with sanitization, header injection prevention)
  - JSON body (with proper JSON escaping)
```

**Preferred concise version**:
```markdown
## Testing

```bash
npm test                 # Run tests
npm run test:coverage    # Generate coverage report
```

See [TESTING.md](TESTING.md) for detailed documentation.
```

### When to Create Separate Documentation Files

Instead of adding detailed sections to README, create dedicated documentation files:

- `TESTING.md` - Detailed testing documentation
- `CONTRIBUTING.md` - Contribution guidelines
- `API.md` - API documentation
- `ARCHITECTURE.md` - System architecture details
- `docs/` directory - For extensive documentation

## Code Style

### Comments

- Keep comments concise and focused on "why", not "what"
- Avoid obvious comments that duplicate code functionality
- Use JSDoc for public APIs only when explicitly requested

### Testing

- Write tests for critical security and data integrity logic
- Focus on SSRF validation, variable replacement, and storage operations
- Maintain existing test coverage levels

## Internationalization (i18n)

- The project supports both Chinese (zh_CN) and English (en)
- Always update both README.md (English) and README.zh-CN.md (Chinese)
- Keep both versions synchronized in structure and content
- Apply the same conciseness guidelines to both language versions
- **Development TODO section**: Only display in README.md (English version), do NOT include in other language versions (e.g., README.zh-CN.md)

## Git Workflow

### Pre-Commit Checklist

**CRITICAL**: Before every commit and push, you MUST run the following checks to ensure code quality and functionality:

1. **Run Tests**

   ```bash
   npm test
   ```

   - All tests must pass
   - Do NOT commit if any test fails

2. **Run Linter**

   ```bash
   npm run lint
   ```

   - Code must pass ESLint checks
   - Fix any linting errors with `npm run lint:fix` if needed

3. **Build the Project**

   ```bash
   npm run build
   ```

   - Build must complete successfully
   - Verify no build errors or warnings

**Workflow Order**:

```bash
# 1. Run tests
npm test

# 2. Check and fix linting
npm run lint:fix

# 3. Build the project
npm run build

# 4. Only then proceed with git commit and push
git add .
git commit -m "Your commit message"
git push
```

### Commit Guidelines

- Only create commits when explicitly requested by the user
- Follow existing commit message style in the repository
- Don't be overly proactive with commits unless asked
- **Never skip the pre-commit checklist** - this ensures code is clean and functional

## Security

- SSRF protection is critical - don't modify webhook validation logic without careful review
- Variable substitution must handle three contexts correctly (URL, headers, JSON)
- Storage operations must remain sequential to prevent race conditions

## When in Doubt

- Prefer simplicity over complexity
- Ask the user before adding extensive documentation
- Keep README files minimal and create separate docs for details
- Follow the principle: "README = Quick Start, DOCS = Deep Dive"
