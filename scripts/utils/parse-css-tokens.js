/**
 * Analisa conteúdo CSS/SCSS para detectar tokens do DS por prefixo
 * @param {string} content - Conteúdo do arquivo
 * @param {string} prefix - Prefixo do DS (ex: 'nb', 'idsw')
 * @returns {{
*   customProperties: string[],
*   scssVariables: string[]
* }}
*/
export function extractCssTokens(content, prefix) {
 const customProperties = new Set();
 const scssVariables = new Set();

 // Tokens CSS: var(--prefix-*)
 const varRegex = new RegExp(`var\\(\\s*(--${prefix}-[a-z0-9-_]+)\\s*\\)`, 'gi');
 for (const match of content.matchAll(varRegex)) {
   customProperties.add(match[1]);
 }

 // Tokens SCSS: $prefix-*
 const scssRegex = new RegExp(`\\$${prefix}-[a-z0-9-_]+`, 'gi');
 for (const match of content.matchAll(scssRegex)) {
   scssVariables.add(match[0]);
 }

 return {
   customProperties: [...customProperties],
   scssVariables: [...scssVariables]
 };
}
