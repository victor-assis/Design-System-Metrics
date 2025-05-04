import { extractCssTokens } from './parse-css-tokens.js';

describe('extractCssTokens', () => {
  test('should return empty arrays for no DS tokens', () => {
    const content = `body { color: red; } .my-class { $var: #000; }`;
    const prefix = 'nb';
    const result = extractCssTokens(content, prefix);
    expect(result.customProperties.sort()).toEqual([]);
    expect(result.scssVariables.sort()).toEqual([]);
  });

  test('should extract only custom properties', () => {
    const content = `div { color: var(--nb-color-primary); border: 1px solid var(--nb-border-default); }`;
    const prefix = 'nb';
    const result = extractCssTokens(content, prefix);
    expect(result.customProperties.sort()).toEqual(['--nb-border-default', '--nb-color-primary'].sort());
    expect(result.scssVariables.sort()).toEqual([]);
  });

  test('should extract only SCSS variables', () => {
    const content = `.component { padding: $nb-spacing-md; margin: $nb-spacing-lg; }`;
    const prefix = 'nb';
    const result = extractCssTokens(content, prefix);
    expect(result.customProperties.sort()).toEqual([]);
    expect(result.scssVariables.sort()).toEqual(['$nb-spacing-lg', '$nb-spacing-md'].sort());
  });

  test('should extract mixed tokens', () => {
    const content = `a { color: var(--nb-text-link); font-size: $nb-font-size-sm; }`;
    const prefix = 'nb';
    const result = extractCssTokens(content, prefix);
    expect(result.customProperties.sort()).toEqual(['--nb-text-link'].sort());
    expect(result.scssVariables.sort()).toEqual(['$nb-font-size-sm'].sort());
  });

  test('should only match tokens with the target prefix', () => {
    const content = `a { color: var(--nb-text-link); background: var(--other-bg); margin: $nb-spacing-xs; padding: $other-padding; }`;
    const prefix = 'nb';
    const result = extractCssTokens(content, prefix);
    expect(result.customProperties.sort()).toEqual(['--nb-text-link'].sort());
    expect(result.scssVariables.sort()).toEqual(['$nb-spacing-xs'].sort());
  });

  test('should return unique tokens for duplicates', () => {
    const content = `p { color: var(--nb-color-text); line-height: var(--nb-color-text); font-family: $nb-font-family; letter-spacing: $nb-font-family; }`;
    const prefix = 'nb';
    const result = extractCssTokens(content, prefix);
    expect(result.customProperties.sort()).toEqual(['--nb-color-text'].sort());
    expect(result.scssVariables.sort()).toEqual(['$nb-font-family'].sort());
  });

  test('should be case-sensitive for prefix matching in variable names', () => {
    const content = `div { color: var(--Nb-color-primary); background: var(--nb-color-secondary); font-style: $Nb-style; font-weight: $nb-weight; }`;
    const prefix = 'Nb'; // Using uppercase 'N'
    const result = extractCssTokens(content, prefix);
    expect(result.customProperties.sort()).toEqual(['--Nb-color-primary'].sort());
    expect(result.scssVariables.sort()).toEqual(['$Nb-style'].sort());
  });

  test('should correctly handle SCSS variables with and without map-get', () => {
    const content = `.class { color: $nb-color-primary; width: map-get($nb-sizes, 'md'); font-family: map-get($nb-typography, "family-sans"); }`;
    const prefix = 'nb';
    const result = extractCssTokens(content, prefix);
    expect(result.customProperties.sort()).toEqual([]);
    // The regex is expected to match '$nb-sizes' from 'map-get($nb-sizes' and '$nb-typography' from 'map-get($nb-typography'.
    expect(result.scssVariables.sort()).toEqual(['$nb-color-primary', '$nb-sizes', '$nb-typography'].sort());
  });

  test('should handle tokens at the beginning or end of lines, or with different spacing', () => {
    const content = `
      var(--nb-start-line);
      $nb-start-line-scss;
      .class {
        prop1:var(--nb-middle);
        prop2:$nb-middle-scss;
        prop3: var( --nb-spaced );
        prop4: $nb-end-line-scss;
        prop5: var( --nb-end-line );
      }
    `;
    const prefix = 'nb';
    const result = extractCssTokens(content, prefix);
    expect(result.customProperties.sort()).toEqual([
      '--nb-end-line',
      '--nb-middle',
      '--nb-spaced',
      '--nb-start-line',
    ].sort());
    expect(result.scssVariables.sort()).toEqual([
      '$nb-end-line-scss',
      '$nb-middle-scss',
      '$nb-start-line-scss',
    ].sort());
  });

  test('should not match if prefix is part of a longer word', () => {
    const content = `
      .class {
        color: var(--not-nb-color);
        background: $not-nb-variable;
        border: var(--nb-is-a-prefix);
        padding: $nb-is-a-scss-prefix;
      }
    `;
    const prefix = 'nb';
    const result = extractCssTokens(content, prefix);
    expect(result.customProperties.sort()).toEqual(['--nb-is-a-prefix'].sort());
    expect(result.scssVariables.sort()).toEqual(['$nb-is-a-scss-prefix'].sort());
  });
});
