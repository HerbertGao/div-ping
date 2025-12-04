/**
 * Custom ESLint rules for div-ping project
 * Enforces i18n usage for user-facing strings
 */

module.exports = {
  'no-chinese-characters': {
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow hardcoded Chinese characters in code - use i18n instead',
        category: 'Internationalization',
        recommended: true,
      },
      messages: {
        noChinese: 'Hardcoded Chinese characters found. Use i18n.t() or chrome.i18n.getMessage() instead.',
      },
      schema: [],
    },
    create(context) {
      // Regex to match Chinese characters
      const chineseRegex = /[\u4e00-\u9fa5]+/;

      return {
        Literal(node) {
          if (typeof node.value === 'string' && chineseRegex.test(node.value)) {
            // Allow Chinese in comments, but not in string literals
            context.report({
              node,
              messageId: 'noChinese',
            });
          }
        },
        TemplateLiteral(node) {
          for (const quasi of node.quasis) {
            if (chineseRegex.test(quasi.value.raw)) {
              context.report({
                node: quasi,
                messageId: 'noChinese',
              });
            }
          }
        },
      };
    },
  },

  'no-hardcoded-user-strings': {
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow hardcoded user-facing strings - use i18n instead',
        category: 'Internationalization',
        recommended: true,
      },
      messages: {
        noHardcodedString: 'Hardcoded user-facing string found in {{method}}. Use i18n.t() instead.',
      },
      schema: [
        {
          type: 'object',
          properties: {
            allowConsole: {
              type: 'boolean',
            },
          },
          additionalProperties: false,
        },
      ],
    },
    create(context) {
      const options = context.options[0] || {};
      const allowConsole = options.allowConsole !== false;

      // Methods that typically show user-facing messages
      const userFacingMethods = [
        'alert',
        'confirm',
        'prompt',
        // Chrome notification API
        'chrome.notifications.create',
        // Don't check console methods if allowConsole is true
        ...(allowConsole ? [] : ['console.log', 'console.error', 'console.warn', 'console.info']),
      ];

      return {
        CallExpression(node) {
          const methodName = context.sourceCode.getText(node.callee);

          // Check if this is a user-facing method call (exact match)
          const isUserFacing = userFacingMethods.includes(methodName);

          if (isUserFacing && node.arguments.length > 0) {
            const firstArg = node.arguments[0];

            // Check if the first argument is a string literal (hardcoded)
            if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
              // Allow empty strings and single characters
              if (firstArg.value.length <= 1) {
                return;
              }

              // Allow strings that look like keys (e.g., 'project_name')
              if (/^[a-z_]+$/.test(firstArg.value)) {
                return;
              }

              context.report({
                node: firstArg,
                messageId: 'noHardcodedString',
                data: {
                  method: methodName,
                },
              });
            }
          }
        },
      };
    },
  },
};
