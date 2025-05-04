import fs from 'fs';
import * as babelParser from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = traverseModule.default;

/**
 * Parses a JS/JSX/TS/TSX file to discover exported PascalCase component names
 * that are not part of the Design System.
 * @param {string} filePath - Path to the file.
 * @param {string[]} dsPrefixes - Prefixes for Design System components (e.g., ['Nb', 'Ds']).
 * @returns {Set<string>} A set of discovered internal JSX component names.
 */
export function discoverJsxInternalComponentNames(filePath, dsPrefixes = []) {
  const discoveredNames = new Set();
  let code;
  try {
    code = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.warn(`[discover-jsx-names] Error reading file ${filePath}: ${error.message}`);
    return discoveredNames; // Return empty set if file can't be read
  }

  try {
    const ast = babelParser.parse(code, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript', // Handles TS syntax, including TSX if 'jsx' is also present
        'decorators-legacy',
        'classProperties',
        // The following are often needed for modern JS/TS syntax:
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'dynamicImport',
        'optionalChaining',
        'nullishCoalescingOperator',
        'objectRestSpread',
        'asyncGenerators',
        'logicalAssignment',
        // Babel parser plugin for import assertions (replaces deprecatedImportAssert)
        // 'importAssertions' // Use this if your Babel version supports it and you prefer it
        'deprecatedImportAssert' // Kept for consistency with other files for now
      ]
    });

    const isPascalCase = (name) => name && /^[A-Z][A-Za-z0-9]*$/.test(name);

    const checkAndAddName = (name) => {
      if (name && isPascalCase(name)) {
        const isDsComponent = dsPrefixes.some(dsp => name.startsWith(dsp));
        if (!isDsComponent) {
          discoveredNames.add(name);
        }
      }
    };

    traverse(ast, {
      ExportDefaultDeclaration(path) {
        const declaration = path.node.declaration;
        if (declaration) {
          if (declaration.id && (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration')) {
            // export default function MyComponent() {}
            // export default class MyComponent {}
            checkAndAddName(declaration.id.name);
          } else if (declaration.type === 'Identifier') {
            // export default MyIdentifier; (where MyIdentifier is defined elsewhere and is PascalCase)
            // For simplicity now, we assume if a PascalCase identifier is default exported, it's a component.
            checkAndAddName(declaration.name);
          }
          // Cases like `export default hoc(MyComponent)` or `export default () => <div/>` are more complex
          // and might require deeper analysis or type information, which is out of scope for simple AST parsing.
        }
      },
      ExportNamedDeclaration(path) {
        const declaration = path.node.declaration;
        if (declaration) {
          if (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') {
            // export function MyComponent() {}
            // export class MyComponent {}
            if (declaration.id) {
              checkAndAddName(declaration.id.name);
            }
          } else if (declaration.type === 'VariableDeclaration') {
            // export const MyComponent = () => {};
            // export let MyOtherComponent = class {};
            declaration.declarations.forEach(variableDeclarator => {
              if (variableDeclarator.id && variableDeclarator.id.type === 'Identifier') {
                // Check if the variable is initialized with a function/arrow function or a class expression,
                // and if its name is PascalCase.
                const init = variableDeclarator.init;
                if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression' || init.type === 'ClassExpression')) {
                  checkAndAddName(variableDeclarator.id.name);
                } else if (init && init.type === 'Identifier' && isPascalCase(init.name)) {
                    // Handles cases like `export const MyComponent = AnotherComponent;`
                    // We are interested in MyComponent as an exported name.
                    checkAndAddName(variableDeclarator.id.name);
                } else if (isPascalCase(variableDeclarator.id.name)) {
                    // If it's a PascalCase export const but not clearly a function/class,
                    // it might be a component defined elsewhere or a HOC. Add it for now.
                    // Example: export const MyComponent = someHoc(AnotherComponent);
                    checkAndAddName(variableDeclarator.id.name);
                }
              }
            });
          }
        } else if (path.node.specifiers) {
          // export { MyComponent, MyOtherComponent as RenamedComponent };
          path.node.specifiers.forEach(specifier => {
            // For `export { localName as exportedName }`, we care about `exportedName`.
            // For `export { name }`, localName and exportedName are the same.
            if (specifier.type === 'ExportSpecifier' && specifier.exported) {
               checkAndAddName(specifier.exported.name || specifier.exported.value); // .value for string literal exports if any
            }
          });
        }
      }
    });
  } catch (error) {
    // console.warn(`[discover-jsx-names] Babel parsing error in file ${filePath}: ${error.message}. Skipping this file for JSX name discovery.`);
    // More detailed error logging could be added if necessary
  }

  return discoveredNames;
}
