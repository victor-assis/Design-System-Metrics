import fs from 'fs';
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';

/**
 * Extrai componentes e props com valores string de um arquivo JSX/TSX.
 * @param {string} filePath - Caminho do arquivo.
 * @param {string[]} dsPrefixes - Prefixos dos componentes do DS, ex: ['Nd', 'Idsw'].
 * @returns {Record<string, Record<string, string[]>>} propValues
 */
export function extractJsxComponents(filePath, dsPrefixes = []) {
  const code = fs.readFileSync(filePath, 'utf8');
  const ast = babelParser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript']
  });

  const result = {};

  traverse(ast, {
    JSXOpeningElement(path) {
      const name = path.node.name;
      if (!name || !name.name) return;

      const tagName = name.name;
      const matchedPrefix = dsPrefixes.find(p => tagName.startsWith(p));
      if (!matchedPrefix) return;

      if (!result[tagName]) result[tagName] = {};

      for (const attr of path.node.attributes) {
        if (attr.type !== 'JSXAttribute') continue;
        const prop = attr.name.name;
        if (!prop) continue;

        const valueNode = attr.value;
        if (!valueNode || valueNode.type !== 'StringLiteral') continue;

        const value = valueNode.value;
        if (!result[tagName][prop]) result[tagName][prop] = [];
        if (!result[tagName][prop].includes(value)) {
          result[tagName][prop].push(value);
        }
      }
    }
  });

  return result;
}
