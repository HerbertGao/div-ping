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
        noHardcodedNotificationString: 'Hardcoded {{property}} in chrome.notifications.create. Use t() for i18n.',
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

      // Methods that take string as first argument
      const stringFirstArgMethods = [
        'alert',
        'confirm',
        'prompt',
        // Don't check console methods if allowConsole is true
        ...(allowConsole ? [] : ['console.log', 'console.error', 'console.warn', 'console.info']),
      ];

      /**
       * Check if a string value should be allowed (is likely an i18n key or empty)
       */
      function isAllowedString(value) {
        // Allow empty strings and single characters
        if (value.length <= 1) {
          return true;
        }

        // Allow strings that look like i18n keys (e.g., 'project_name', 'errorCode')
        if (/^[a-z_][a-z0-9_]*$/i.test(value)) {
          return true;
        }

        return false;
      }

      /**
       * Check object properties for hardcoded strings
       */
      function checkObjectProperties(objNode, userFacingProps, methodName) {
        if (objNode.type !== 'ObjectExpression') {
          return;
        }

        for (const prop of objNode.properties) {
          if (prop.type !== 'Property') {
            continue;
          }

          // Get property name
          let propName = null;
          if (prop.key.type === 'Identifier') {
            propName = prop.key.name;
          } else if (prop.key.type === 'Literal') {
            propName = prop.key.value;
          }

          // Check if this property should contain user-facing text
          if (userFacingProps.includes(propName)) {
            const value = prop.value;

            // Check for hardcoded string literal
            if (value.type === 'Literal' && typeof value.value === 'string') {
              if (!isAllowedString(value.value)) {
                context.report({
                  node: value,
                  messageId: 'noHardcodedNotificationString',
                  data: {
                    property: propName,
                  },
                });
              }
            }
            // Check for template literals (backticks)
            else if (value.type === 'TemplateLiteral' && value.expressions.length === 0) {
              // Template literal with no expressions is essentially a string
              const stringValue = value.quasis[0]?.value.raw || '';
              if (!isAllowedString(stringValue)) {
                context.report({
                  node: value,
                  messageId: 'noHardcodedNotificationString',
                  data: {
                    property: propName,
                  },
                });
              }
            }
          }
        }
      }

      return {
        CallExpression(node) {
          const methodName = context.sourceCode.getText(node.callee);

          // Handle chrome.notifications.create specially
          if (methodName === 'chrome.notifications.create' && node.arguments.length > 0) {
            // First argument can be notificationId (string) or options (object)
            // Second argument is options if first was ID
            let optionsArg = node.arguments[0];

            // If first arg is string, options is second arg
            if (optionsArg.type === 'Literal' || optionsArg.type === 'TemplateLiteral') {
              optionsArg = node.arguments[1];
            }

            if (optionsArg) {
              // Check title and message properties in options object
              checkObjectProperties(optionsArg, ['title', 'message'], methodName);
            }
            return;
          }

          // Handle other user-facing methods (string as first argument)
          const isUserFacing = stringFirstArgMethods.includes(methodName);

          if (isUserFacing && node.arguments.length > 0) {
            const firstArg = node.arguments[0];

            // Check if the first argument is a string literal (hardcoded)
            if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
              if (!isAllowedString(firstArg.value)) {
                context.report({
                  node: firstArg,
                  messageId: 'noHardcodedString',
                  data: {
                    method: methodName,
                  },
                });
              }
            }
          }
        },
      };
    },
  },
};
