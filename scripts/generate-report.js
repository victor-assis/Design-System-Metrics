import fs from 'fs';
import path from 'path';

const INPUT_PATH = path.resolve('reports/web-usage.json');
const OUTPUT_JSON = path.resolve('analyzer/reports/final-report.json');
const OUTPUT_MD = path.resolve('analyzer/reports/final-report.md');

const reportsDir = path.dirname(OUTPUT_JSON);
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

if (!fs.existsSync(INPUT_PATH)) {
  console.error('❌ web-usage.json não encontrado.');
  process.exit(1);
}

const usageMap = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));

// Separate DS prefixes from other top-level keys
const dsPrefixKeys = Object.keys(usageMap).filter(key =>
    !['framework', 'score', 'outsideComponents', 'internalComponents', 'propValues'].includes(key)
);

const finalReport = {
  framework: usageMap.framework,
  score: usageMap.score || {},
  outsideComponents: usageMap.outsideComponents || {},
  internalComponents: usageMap.internalComponents || {},
  propValues: usageMap.propValues || {}, // For JSON report, include all propValues globally
  systems: {}
};

for (const prefixKey of dsPrefixKeys) {
  if (usageMap[prefixKey] && typeof usageMap[prefixKey] === 'object') { // Basic check for a DS object
       finalReport.systems[prefixKey] = usageMap[prefixKey];
  }
}

// Start building the Markdown report string
let mdReport = "# Web Usage Analysis Report\n\n";

mdReport += "## Overall Summary\n";
mdReport += `- **Framework Detected**: ${usageMap.framework}\n`; // Use usageMap.framework
if (usageMap.score && Object.keys(usageMap.score).length > 0) {
  mdReport += `- **Adoption Score**:\n`;
  for (const [key, value] of Object.entries(usageMap.score)) {
    mdReport += `    - **${key.charAt(0).toUpperCase() + key.slice(1)}**: ${value}\n`;
  }
}
mdReport += "\n---\n\n";

// Utility functions - can remain the same
const formatList = (title, obj) => {
  if (!obj || Object.keys(obj).length === 0) return '';
  return `### ${title}\n` +
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .map(([key, val]) => `- \`${key}\`: **${val}**`)
      .join('\n') +
    '\n\n';
};

const renderPropsMarkdown = data => {
  if (!data || Object.keys(data).length === 0) return '';
  let md = `### 🧬 Props usadas por componente\n\n`;
  for (const [component, props] of Object.entries(data)) {
    md += `**${component}**\n`;
    for (const [prop, values] of Object.entries(props)) {
      md += `- \`${prop}\`: ${values.map(v => `\`${v}\``).join(', ')}\n`;
    }
    md += '\n';
  }
  return md;
};

// Process each Design System
for (const prefix of dsPrefixKeys) {
  const data = usageMap[prefix]; // data is now usageMap[prefix]
  if (!data) continue; // Should not happen if dsPrefixKeys is derived from usageMap correctly

  // JSON report part for systems is already handled by the new finalReport structure

  let mdSystemSection = `## Design System: \`${prefix}\`\n\n`;

  mdSystemSection += formatList('Component Usage (`<tag>`)', data.components);
  mdSystemSection += formatList('Directive Usage', data.directives);
  mdSystemSection += formatList('Class Usage', data.classes);
  mdSystemSection += formatList('CSS Custom Property Usage', data.customProperties);
  mdSystemSection += formatList('SCSS Variable Usage', data.scssVariables);
  // REMOVE propValues from per-DS section:
  // mdSystemSection += renderPropsMarkdown(data.propValues);
  mdReport += mdSystemSection + "\n---\n\n";
}

// Add Global propValues Section to Markdown
mdReport += "\n---\n\n"; // Separator
mdReport += "## Global Property Values (from first DS prefix components)\n\n";
mdReport += renderPropsMarkdown(usageMap.propValues); // Call with top-level propValues
mdReport += "\n---\n\n";

// Add Global Application-Specific Components Section to Markdown
mdReport += "## Application-Specific Components\n\n";
// No need for firstSystemPrefix or globalData here for these
mdReport += formatList('Internal Application Components', usageMap.internalComponents);
mdReport += formatList('Unrecognized Custom Components (Outside Components)', usageMap.outsideComponents);
mdReport += "\n---\n\n";

// Save the reports
fs.writeFileSync(OUTPUT_JSON, JSON.stringify(finalReport, null, 2));
fs.writeFileSync(OUTPUT_MD, mdReport); // Write the consolidated mdReport string

console.log(`✅ Markdown and JSON reports saved.`);
