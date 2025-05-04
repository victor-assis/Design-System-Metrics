import fs from 'fs';
import fg from 'fast-glob';
import path from 'path';

const COMPONENTS_PATH = path.resolve('config/components.json');
const OUTPUT_PATH = path.resolve('reports/android-usage.json');

const config = JSON.parse(fs.readFileSync(COMPONENTS_PATH, 'utf-8'));
const components = config.android || [];

const usageMap = Object.fromEntries(components.map(c => [c, 0]));

const files = await fg(['**/*.{kt,java,xml}'], {
  ignore: ['node_modules', 'dist', 'build', 'reports']
});

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  for (const component of components) {
    const regex = new RegExp(`\\b${component}\\b`, 'g');
    const matches = content.match(regex);
    if (matches) {
      usageMap[component] += matches.length;
    }
  }
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(usageMap, null, 2));
console.log(`✅ Android usage report saved to ${OUTPUT_PATH}`);
