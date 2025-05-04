import fs from 'fs';
import fg from 'fast-glob';
import nodePath from 'path'; // Rename to avoid conflict in global scope if necessary, though 'path' is conventional
import * as babelParser from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse = traverseModule.default;

import { extractHtmlUsage } from './utils/parse-html-ast.js';
import { extractCssTokens } from './utils/parse-css-tokens.js';
import { extractJsxUsage } from './utils/parse-jsx-ast.js';
import { discoverJsxInternalComponentNames } from './utils/discover-jsx-names.js';

// Use the renamed import for global scope path operations
const OUTPUT_PATH = nodePath.resolve('reports/web-usage.json');
const DS_PREFIXES = ['nb', 'mat'];
const firstDsPrefix = DS_PREFIXES.length > 0 ? DS_PREFIXES[0] : null;

const processedTemplateUrls = new Set(); // For Angular template double counting fix
const discoveredAngularSelectors = new Set();
const discoveredJsxInternalNames = new Set();

const usageMap = {
  framework: 'unknown',
  outsideComponents: {},
  internalComponents: {},
  propValues: {} // propValues will also be a top-level key as per desired output
};

for (const prefix of DS_PREFIXES) {
  usageMap[prefix] = {
    components: {},
    classes: {},
    customProperties: {},
    scssVariables: {},
    directives: {}
    // propValues is now top-level, associated with firstDsPrefix components
    // outsideComponents is now top-level
    // internalComponents is now top-level
  };
}

if (fs.existsSync('angular.json')) usageMap.framework = 'angular';
else if (fs.existsSync('vite.config.ts') || fs.existsSync('vite.config.js')) usageMap.framework = 'react-vite';
else if (fs.existsSync('next.config.js')) usageMap.framework = 'nextjs';
else if (fs.existsSync('vue.config.js')) usageMap.framework = 'vue';
else if (fs.existsSync('package.json')) {
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    if (pkg.dependencies?.react) usageMap.framework = 'react';
    else if (pkg.dependencies?.vue) usageMap.framework = 'vue';
    else if (pkg.dependencies?.svelte) usageMap.framework = 'svelte';
  } catch {}
}

const allFiles = await fg(['**/*.{ts,tsx,js,jsx,html,vue,css,scss}'], {
  ignore: ['**/node_modules/**', 'dist', 'build', 'reports', 'analyzer']
});

const jsFiles = allFiles.filter(f => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.tsx') || f.endsWith('.jsx'));
const htmlFiles = allFiles.filter(f => f.endsWith('.html') || f.endsWith('.vue'));
const cssFiles = allFiles.filter(f => f.endsWith('.css') || f.endsWith('.scss'));

const capitalizedDsPrefixes = DS_PREFIXES.map(p => p.charAt(0).toUpperCase() + p.slice(1));
for (const file of jsFiles) {
    const foundJsxNames = discoverJsxInternalComponentNames(file, capitalizedDsPrefixes);
    foundJsxNames.forEach(name => discoveredJsxInternalNames.add(name));
}

/**
 * Discovers Angular component selectors from a TypeScript file and adds them to the provided set.
 * @param {string} filePath Path to the TypeScript file.
 * @param {string[]} dsPrefixes Array of Design System prefixes (e.g., ['nb']).
 * @param {Set<string>} selectorsSet The set to add discovered selectors to.
 */
function discoverAngularSelectorsInTsFile(filePath, dsPrefixes, selectorsSet) {
  const dsTagPrefixes = dsPrefixes.map(p => p + '-'); // e.g., ['nb-']
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    const ast = babelParser.parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'decorators-legacy', 'deprecatedImportAssert']
    });

    traverse(ast, {
      ClassDeclaration(astPath) {
        if (astPath.node.decorators) {
          for (const decorator of astPath.node.decorators) {
            if (
              decorator.expression.type === 'CallExpression' &&
              decorator.expression.callee.type === 'Identifier' &&
              decorator.expression.callee.name === 'Component'
            ) {
              const arg = decorator.expression.arguments[0];
              if (arg && arg.type === 'ObjectExpression') {
                for (const prop of arg.properties) {
                  if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier' &&
                      prop.key.name === 'selector' && prop.value.type === 'StringLiteral') {
                    const selector = prop.value.value;
                    const isPotentialElementSelector = /^[a-zA-Z0-9_]+-[a-zA-Z0-9_-]*$/.test(selector);
                    if (selector && isPotentialElementSelector) {
                      const isDsComponentSelector = dsTagPrefixes.some(dsp => selector.startsWith(dsp));
                      if (!isDsComponentSelector) {
                        selectorsSet.add(selector);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
  } catch (error) {
    console.warn(`[scan-web] Error parsing Angular TS file for selector discovery ${filePath}:`, error.message);
  }
}

// New loop for Angular Selector Discovery
const tsFilesForSelectorDiscovery = allFiles.filter(f => f.endsWith('.ts') && !f.endsWith('.tsx'));

for (const file of tsFilesForSelectorDiscovery) {
  discoverAngularSelectorsInTsFile(file, DS_PREFIXES, discoveredAngularSelectors);
}

/**
 * Extracts Angular component template usage from a TypeScript file.
 * @param {string} filePath Path to the TypeScript file.
 * @param {string[]} dsPrefixes Array of Design System prefixes (e.g., ['nb']).
 * @returns {object|null} Usage data from extractHtmlUsage, or null.
 */
function extractAngularUsageFromTs(filePath, dsPrefixes) {
  // Selector discovery is now done in the initial pass.
  // This function focuses on extracting HTML content.
  // appPrefixes parameter removed as it's no longer used.
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    const ast = babelParser.parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'decorators-legacy', 'deprecatedImportAssert']
    });

    let htmlContent = null;

    traverse(ast, {
      ClassDeclaration(astPath) { // Renamed 'path' to 'astPath' to avoid conflict
        if (astPath.node.decorators) {
          for (const decorator of astPath.node.decorators) {
            if (
              decorator.expression.type === 'CallExpression' &&
              decorator.expression.callee.type === 'Identifier' &&
              decorator.expression.callee.name === 'Component'
            ) {
              const arg = decorator.expression.arguments[0];
              if (arg && arg.type === 'ObjectExpression') {
                for (const prop of arg.properties) {
                  if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier') {
                    if (prop.key.name === 'template') {
                      if (prop.value.type === 'StringLiteral') {
                        htmlContent = prop.value.value;
                      } else if (prop.value.type === 'TemplateLiteral') {
                        // For simplicity, concatenate quasi parts. Could be more complex with expressions.
                        htmlContent = prop.value.quasis.map(q => q.value.cooked).join('');
                      }
                      break; // Found template
                    } else if (prop.key.name === 'templateUrl') {
                      if (prop.value.type === 'StringLiteral') {
                        const templateUrl = prop.value.value;
                        // Use the imported 'nodePath' module here
                        const templatePathResolved = nodePath.resolve(nodePath.dirname(filePath), templateUrl);
                        if (fs.existsSync(templatePathResolved)) {
                          htmlContent = fs.readFileSync(templatePathResolved, 'utf8');
                          processedTemplateUrls.add(templatePathResolved); // Add to processed set
                        } else {
                          console.warn(`[scan-web] TemplateUrl not found: ${templatePathResolved} referenced in ${filePath}`);
                        }
                      }
                      break; // Found templateUrl
                    }
                    // Selector discovery logic removed from here
                  }
                }
              }
            }
            // No need to break if only selector found, might still need template/templateUrl
            // if (htmlContent) break;
          }
        }
        // Stop traversal if template found in a class, but allow selector processing to continue for all decorators.
        // This means if a file has multiple components, all selectors can be found.
        // if (htmlContent) astPath.stop(); // This might be too early if we want all selectors from a file.
                                          // However, typical Angular files have one component.
                                          // For now, let's keep it as is, prioritizing template extraction.
                                          // If a component has a selector but no template/templateUrl, htmlContent remains null.
      }
    });

    // The function's main purpose is to return HTML content for parsing.
    // Selector discovery is a side-effect for populating the global set.
    if (htmlContent) {
      // Pass discoveredAngularSelectors (global set). appPrefixes was removed from extractHtmlUsage.
      return extractHtmlUsage(htmlContent, dsPrefixes, discoveredAngularSelectors);
    }
  } catch (error) {
  console.warn(`[scan-web] Error parsing Angular TS file for template extraction ${filePath}:`, error.message);
  }
  return null;
}

// 📦 Análise JS/TS/JSX/TSX
for (const file of jsFiles) {
  let angularUsage = null;
  if (file.endsWith('.ts') && !file.endsWith('.tsx')) {
    angularUsage = extractAngularUsageFromTs(file, DS_PREFIXES);
  }

  // capitalizedDsPrefixes is already defined above, no need to redefine.
  // const capitalizedAppPrefixes = APP_PREFIXES.map(p => p.charAt(0).toUpperCase() + p.slice(1)); // This line is removed.
  // Pass discoveredJsxInternalNames (global set). appPrefixes was removed from extractJsxUsage.
  const jsxUsage = extractJsxUsage(file, capitalizedDsPrefixes, discoveredJsxInternalNames);

  for (const prefix of DS_PREFIXES) {
    const target = usageMap[prefix];

    if (angularUsage) {
      mergeHtmlUsage(angularUsage, target, prefix, firstDsPrefix, usageMap); // Reverted: Removed filePath
    }

    if (jsxUsage && jsxUsage.components && typeof jsxUsage.components === 'object') {
      for (const [tag, count] of Object.entries(jsxUsage.components)) {
        if (tag.toLowerCase().startsWith(prefix)) { // prefix is 'nb'
          // Removed NbIcon logging
          target.components[tag] = (target.components[tag] || 0) + count;
        }
      }
    }
    if (jsxUsage && jsxUsage.propValues && typeof jsxUsage.propValues === 'object') {
      for (const [tag, props] of Object.entries(jsxUsage.propValues)) {
        if (firstDsPrefix && prefix === firstDsPrefix && tag.toLowerCase().startsWith(firstDsPrefix)) {
          if (!usageMap.propValues[tag]) usageMap.propValues[tag] = {};
          for (const [prop, values] of Object.entries(props)) { // Assumes props is an object
            if (!usageMap.propValues[tag][prop]) usageMap.propValues[tag][prop] = [];
            for (const value of values) { // Assumes values is an array
              if (!usageMap.propValues[tag][prop].includes(value)) {
                usageMap.propValues[tag][prop].push(value);
              }
            }
          }
        }
      }
    }
    if (jsxUsage && jsxUsage.directives && typeof jsxUsage.directives === 'object') {
      for (const [directive, count] of Object.entries(jsxUsage.directives)) {
        if (directive.toLowerCase().startsWith(prefix)) {
          target.directives[directive] = (target.directives[directive] || 0) + count;
        }
      }
    }
    if (prefix === firstDsPrefix) { // Process these only once per file effectively
        if (jsxUsage && jsxUsage.internalComponents && typeof jsxUsage.internalComponents === 'object') {
            for (const [tag, count] of Object.entries(jsxUsage.internalComponents)) {
                usageMap.internalComponents[tag] = (usageMap.internalComponents[tag] || 0) + count;
            }
        }
        if (jsxUsage && jsxUsage.outsideComponents && typeof jsxUsage.outsideComponents === 'object') {
            for (const [tag, count] of Object.entries(jsxUsage.outsideComponents)) {
                usageMap.outsideComponents[tag] = (usageMap.outsideComponents[tag] || 0) + count;
            }
        }
    }

    // Merge CSS class usage from JSX/TSX
    if (jsxUsage && jsxUsage.classes && typeof jsxUsage.classes === 'object') {
      for (const [cls, count] of Object.entries(jsxUsage.classes)) {
        // jsxUsage.classes contains DS-prefixed classes (e.g., "nb-button")
        // Filter for the current prefix being processed in the loop.
        // DS_PREFIXES are like ['nb'], classes are like 'nb-button'.
        // The check in extractJsxUsage is `dsClassPrefixes.some(p => cls.startsWith(p))`
        // where dsClassPrefixes are `nb-`, `idsw-` etc.
        // So, cls already has the full prefix e.g. "nb-button".
        // We need to ensure it matches the *current* `prefix` from `DS_PREFIXES`.
        if (cls.toLowerCase().startsWith(prefix.toLowerCase() + '-')) {
          target.classes[cls] = (target.classes[cls] || 0) + count;
        }
      }
    }
  }
}

// 📦 Análise HTML/Vue
for (const file of htmlFiles) {
  const absoluteFilePath = nodePath.resolve(file); // Ensure absolute path for comparison
  if (processedTemplateUrls.has(absoluteFilePath)) {
    continue;
  }
  const content = fs.readFileSync(file, 'utf8');
  // Pass discoveredAngularSelectors (global set). appPrefixes was removed from extractHtmlUsage.
  const htmlResult = extractHtmlUsage(content, DS_PREFIXES, discoveredAngularSelectors);
  for (const prefix of DS_PREFIXES) {
    const target = usageMap[prefix];
    mergeHtmlUsage(htmlResult, target, prefix, firstDsPrefix, usageMap); // Reverted: Removed filePath
  }
}

// 🎨 CSS/SCSS
for (const file of cssFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const prefix of DS_PREFIXES) {
    const tokens = extractCssTokens(content, prefix);
    const target = usageMap[prefix];

    for (const token of tokens.customProperties) {
      target.customProperties[token] = (target.customProperties[token] || 0) + 1;
    }

    for (const token of tokens.scssVariables) {
      target.scssVariables[token] = (target.scssVariables[token] || 0) + 1;
    }

    for (const cls of tokens.classes || []) {
      target.classes[cls] = (target.classes[cls] || 0) + 1;
    }
  }
}

// 🔗 Utilitário de Merge
function mergeHtmlUsage(htmlResult, target, prefix, firstDsPrefix, globalUsageMap) { // Reverted: Removed filePath parameter
  for (const [tag, count] of Object.entries(htmlResult.components)) {
    if (!tag.toLowerCase().startsWith(prefix)) continue; // prefix is 'nb'
    // Removed nb-icon logging
    target.components[tag] = (target.components[tag] || 0) + count;
  }
  for (const [tag, props] of Object.entries(htmlResult.propValues)) {
    if (!(firstDsPrefix && prefix === firstDsPrefix && tag.toLowerCase().startsWith(firstDsPrefix))) continue;
    if (!globalUsageMap.propValues[tag]) globalUsageMap.propValues[tag] = {};
    for (const [prop, values] of Object.entries(props)) {
      if (!globalUsageMap.propValues[tag][prop]) globalUsageMap.propValues[tag][prop] = [];
      for (const value of values) {
        if (!globalUsageMap.propValues[tag][prop].includes(value)) {
          globalUsageMap.propValues[tag][prop].push(value);
        }
      }
    }
  }
  // Merge directives
  if (htmlResult.directives && typeof htmlResult.directives === 'object') {
    for (const [directive, count] of Object.entries(htmlResult.directives)) {
      // Assuming parse-html-ast.js ensures directives are correctly DS-prefixed.
      // The prefix check here is for ensuring it belongs to the current DS context being processed.
      if (directive.toLowerCase().startsWith(prefix.toLowerCase())) {
        target.directives[directive] = (target.directives[directive] || 0) + count;
      }
    }
  } else if (htmlResult.directives) {
    // Add a warning if htmlResult.directives is not an object but exists, to help diagnose
    console.warn(`[scan-web] Warning: htmlResult.directives in mergeHtmlUsage was expected to be an object, but got: ${typeof htmlResult.directives}`);
  }
  for (const [tag, count] of Object.entries(htmlResult.outsideComponents)) {
    globalUsageMap.outsideComponents[tag] = (globalUsageMap.outsideComponents[tag] || 0) + count;
  }
  // Ensure htmlResult.internalComponents exists and is an object before iterating
  if (htmlResult.internalComponents && typeof htmlResult.internalComponents === 'object') {
    for (const [tag, count] of Object.entries(htmlResult.internalComponents)) {
      globalUsageMap.internalComponents[tag] = (globalUsageMap.internalComponents[tag] || 0) + count;
    }
  }
  // Merge classes usage
  // Ensure htmlResult.classes exists and is an object before iterating
  if (htmlResult.classes && typeof htmlResult.classes === 'object') {
    for (const [cls, count] of Object.entries(htmlResult.classes)) { // htmlResult.classes contains ALL DS classes
      if (cls.toLowerCase().startsWith(prefix.toLowerCase() + '-')) { // Add this filter
        target.classes[cls] = (target.classes[cls] || 0) + count;
      }
    }
  }
}

/**
 * Calculates the usage score based on component categories.
 * @param {object} usageMap The main map containing all usage statistics.
 * @param {string[]} dsPrefixes Array of Design System prefixes (e.g., ['nb']).
 * @returns {object} An object containing the score, e.g., {"score": {"nb": "60%", "mat": "10%", "internal": "20%", "external": "10%"}}
 */
function calculateUsageScore(usageMap, dsPrefixes) {
  const dsCounts = {};
  let internal_count = 0;
  let external_count = 0;
  const scores = {};

  // Calculate component counts for each DS prefix
  for (const prefix of dsPrefixes) {
    dsCounts[prefix] = Object.values(usageMap[prefix]?.components || {}).reduce((sum, count) => sum + count, 0);
  }

  // Calculate internal_count and external_count
  // These are now taken from the top-level keys in usageMap.
  internal_count = Object.values(usageMap.internalComponents || {}).reduce((sum, count) => sum + count, 0);
  external_count = Object.values(usageMap.outsideComponents || {}).reduce((sum, count) => sum + count, 0);
  // const firstPrefixForCounts = dsPrefixes.length > 0 ? dsPrefixes[0] : null;
  // if (firstPrefixForCounts && usageMap[firstPrefixForCounts]) {
  //   internal_count = Object.values(usageMap[firstPrefixForCounts].internalComponents || {}).reduce((sum, count) => sum + count, 0);
  //   external_count = Object.values(usageMap[firstPrefixForCounts].outsideComponents || {}).reduce((sum, count) => sum + count, 0);
  // }

  const total_ds_components_count = Object.values(dsCounts).reduce((sum, count) => sum + count, 0);
  const grand_total_count = total_ds_components_count + internal_count + external_count;

  if (grand_total_count === 0) {
    for (const prefix of dsPrefixes) {
      scores[prefix] = "0%";
    }
    scores.internal = "0%";
    scores.external = "0%";
    return { score: scores };
  }

  // Calculate percentages as floating point numbers first
  const floatPercentages = {};
  for (const prefix of dsPrefixes) {
    floatPercentages[prefix] = (dsCounts[prefix] / grand_total_count) * 100;
  }
  floatPercentages.internal = (internal_count / grand_total_count) * 100;
  floatPercentages.external = (external_count / grand_total_count) * 100;

  // Round all percentages and calculate sum of rounded
  let sumOfRoundedPercentages = 0;
  const roundedPercentages = {};

  // Keep track of keys to adjust the last one if needed
  const percentageKeys = [...dsPrefixes, 'internal', 'external'];

  for (const key of percentageKeys) {
    roundedPercentages[key] = Math.round(floatPercentages[key]);
    sumOfRoundedPercentages += roundedPercentages[key];
  }

  // Adjust if sum is not 100%
  let diff = 100 - sumOfRoundedPercentages;
  if (diff !== 0) {
    // Attempt to adjust the 'external' percentage first if it's not zero,
    // or the largest DS component percentage.
    // This is a simple heuristic. More complex logic could distribute the difference.
    const keyToAdjust = roundedPercentages.external !== 0 && floatPercentages.external > 0 ? 'external' :
      dsPrefixes.reduce((a, b) => floatPercentages[a] > floatPercentages[b] ? a : b, dsPrefixes[0]);

    if (roundedPercentages[keyToAdjust] + diff >= 0) { // Ensure adjustment doesn't make it negative
        roundedPercentages[keyToAdjust] += diff;
    } else {
        // If simple adjustment makes it negative, apply a more basic fix or log warning
        // For now, just ensure it's not negative, accepting sum might not be 100
        // A more robust solution would distribute the difference based on original proportions
        console.warn(`[scan-web] Could not perfectly adjust percentages to sum to 100%. Current diff: ${diff} on key ${keyToAdjust}`);
        // Fallback: Set the adjusted value to 0 if it would go negative, and accept the sum might be off
        // Or, try to distribute the remaining difference to other positive values (more complex)
        // For simplicity here, we'll just cap at 0.
        if (roundedPercentages[keyToAdjust] + diff < 0) {
            diff += roundedPercentages[keyToAdjust]; // amount that made it negative
            roundedPercentages[keyToAdjust] = 0;
            // Try to apply remaining diff to another category if possible (e.g. largest DS prefix)
            // This part can get intricate; for now, we accept potential small deviations if this case is hit.
        }
    }
  }

  // Convert to string with '%'
  for (const key of percentageKeys) {
    scores[key] = roundedPercentages[key] + '%';
  }

  return { score: scores };
}

// Calculate score before saving
const calculatedScoreObject = calculateUsageScore(usageMap, DS_PREFIXES);
if (calculatedScoreObject && calculatedScoreObject.score) { // Check if score object and its property exist
  usageMap.score = calculatedScoreObject.score;
} else {
  // Fallback or warning if score calculation didn't return expected structure
  console.warn('[scan-web] Score calculation did not return the expected structure. Skipping score in output.');
  usageMap.score = {
    nb: "0%",
    internal: "0%",
    external: "0%"
  }; // Default/error score
}

// 💾 Salvar
// Use the imported 'nodePath' module here
const reportsDir = nodePath.dirname(OUTPUT_PATH);
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(usageMap, null, 2));
console.log(`✅ Web usage report saved to ${OUTPUT_PATH}`);
