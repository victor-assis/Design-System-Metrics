import fs from 'fs';
import * as babelParser from '@babel/parser';

import traverseModule from '@babel/traverse';
const traverse = traverseModule.default;

/**
 * Extrai componentes, props, diretivas e componentes internos de um arquivo JSX/TSX.
 * @param {string} filePath - Caminho do arquivo.
 * @param {string[]} dsPrefixes - Prefixos dos componentes e diretivas do DS, ex: ['Nb', 'Idsw']. (Note: para diretivas, o prefixo pode ser minúsculo ex: 'nb')
 * @param {Set<string>} discoveredJsxInternalNamesSet - Set of discovered JSX internal component names.
 * @returns {{
 *   components: Record<string, number>,
 *   propValues: Record<string, Record<string, (string | number | boolean)[]>>, // Prop values can be string, number or boolean
 *   directives: Record<string, number>,
 *   internalComponents: Record<string, number>,
 *   outsideComponents: Record<string, number>,
 *   classes: Record<string, number>
 * }}
 */
export function extractJsxUsage(filePath, dsPrefixes = [], discoveredJsxInternalNamesSet = new Set()) {
  // appPrefixes parameter and related logic/logs have been removed.
  // The main logic now uses discoveredJsxInternalNamesSet for internal component identification.
  const code = fs.readFileSync(filePath, 'utf8');
  const ast = babelParser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript', 'decorators-legacy', 'deprecatedImportAssert']
  });

  const result = {
    components: {},
    propValues: {},
    directives: {},
    internalComponents: {},
    outsideComponents: {},
    classes: {} // Initialize classes
  };

  const dsClassPrefixes = dsPrefixes.map(p => `${p.toLowerCase()}-`);

  // As diretivas podem ter prefixos diferentes (ex: minúsculos como 'nbButton')
  // enquanto componentes são capitalizados (ex: 'NbButton').
  // Vamos assumir que dsPrefixes pode conter ambos os tipos de casos ou que serão tratados adequadamente.
  // Para este contexto, vamos assumir que os prefixos de diretiva são os mesmos que os de componentes,
  // mas em minúsculas para corresponder a atributos como `nbButton`.
  // Esta lógica pode precisar de ajuste com base na convenção real de nomenclatura de diretivas.
  const directiveAttributePrefixes = dsPrefixes.map(p => p.toLowerCase());


  traverse(ast, {
    JSXOpeningElement(path) {
      const nameNode = path.node.name;
      if (!nameNode || !nameNode.name) return; // Ignora elementos como <></> ou <Component.SubComponent /> por enquanto

      const tagName = nameNode.name;
      const isDSComponent = dsPrefixes.some(p => tagName.startsWith(p));

      if (isDSComponent) {
        result.components[tagName] = (result.components[tagName] || 0) + 1;
        if (!result.propValues[tagName]) result.propValues[tagName] = {};

        for (const attr of path.node.attributes) {
          if (attr.type !== 'JSXAttribute' || !attr.name) continue;
          
          const propName = attr.name.name;
          if (!propName) continue;

          let value; // Variable to store the extracted prop value

          if (attr.value === null) {
            // Case: <MyComponent disabled />
            value = true;
          } else if (attr.value.type === 'StringLiteral') {
            // Case: <MyComponent name="text" />
            value = attr.value.value;
          } else if (attr.value.type === 'JSXExpressionContainer') {
            // Case: <MyComponent count={5} active={true} size={'large'} />
            const expression = attr.value.expression;
            if (expression.type === 'StringLiteral' ||
                expression.type === 'NumericLiteral' ||
                expression.type === 'BooleanLiteral') {
              value = expression.value;
            }
            // Optional: Handle Identifier 'undefined' or 'null' if needed later
            // else if (expression.type === 'Identifier' && (expression.name === 'undefined' || expression.name === 'null')) {
            //   value = expression.name; // Or skip
            // }
          }

          if (value !== undefined) {
            if (!result.propValues[tagName][propName]) {
              result.propValues[tagName][propName] = [];
            }
            if (!result.propValues[tagName][propName].includes(value)) {
              result.propValues[tagName][propName].push(value);
            }
          }

          // Prop value extraction is done for DS Components.
          // Directive checking will be done in a separate loop for all elements.
        }
      } else if (discoveredJsxInternalNamesSet.has(tagName)) {
        result.internalComponents[tagName] = (result.internalComponents[tagName] || 0) + 1;
      } else {
        // Not a DS Component, not a discovered Internal Component.
        // Check if it's an "outside" component (PascalCase, not standard HTML tag).
        if (/^[A-Z]/.test(tagName)) {
          result.outsideComponents[tagName] = (result.outsideComponents[tagName] || 0) + 1;
        }
      }

      // Verifica diretivas em qualquer elemento (não apenas DS) - se necessário
      // A lógica atual em extractHtmlUsage parece contar diretivas em qualquer tag.
      // Para JSX, diretivas como atributos são menos comuns fora de componentes específicos.
      // Se uma diretiva como `nbTooltip` puder ser aplicada a um `<div>`, essa lógica seria aqui.
      // Por ora, focamos em diretivas como atributos de componentes DS.
      // Se precisarmos expandir, podemos adicionar outro loop aqui pelos atributos
      // e verificar contra `directiveAttributePrefixes` para qualquer `tagName`.

      // --- Directive Extraction (All Elements) ---
      for (const attr of path.node.attributes) {
        if (attr.type === 'JSXAttribute' && attr.name && attr.name.name) {
          const propName = attr.name.name;
          // Simplified directive check
          if (directiveAttributePrefixes.some(prefix => propName.toLowerCase().startsWith(prefix) && propName.length > prefix.length)) {
            result.directives[propName] = (result.directives[propName] || 0) + 1;
          }
        }
      }

      // --- CSS Class Extraction (All Elements) ---
      // This applies to any JSX element, not just DS components.
      for (const attr of path.node.attributes) {
        if (attr.type === 'JSXAttribute' && attr.name && (attr.name.name === 'className' || attr.name.name === 'class')) {
          const processClasses = (classString) => {
            if (typeof classString !== 'string') return;
            const classes = classString.split(/\s+/).filter(Boolean);
            for (const cls of classes) {
              if (dsClassPrefixes.some(p => cls.startsWith(p))) {
                result.classes[cls] = (result.classes[cls] || 0) + 1;
              }
            }
          };

          if (attr.value) {
            if (attr.value.type === 'StringLiteral') {
              processClasses(attr.value.value);
            } else if (attr.value.type === 'JSXExpressionContainer') {
              const expression = attr.value.expression;
              if (expression.type === 'StringLiteral') {
                processClasses(expression.value);
              } else if (expression.type === 'TemplateLiteral') {
                expression.quasis.forEach(quasi => {
                  processClasses(quasi.value.cooked);
                });
              }
              // Note: More complex expressions in JSXExpressionContainer (e.g., function calls, variables)
              // are not statically analyzed here. Only string literals and template literals are processed.
            }
          }
          break; // Found className/class, no need to check other attributes for this purpose
        }
      }
    }
  });

  return result;
}
