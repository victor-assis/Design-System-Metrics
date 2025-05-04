import fs from 'fs';
import { extractJsxUsage } from './parse-jsx-ast.js';

jest.mock('fs'); // Mock the entire fs module

describe('extractJsxUsage', () => {
  const dsPrefixes = ['Nb']; // For components Nb*, directives nb* (lowercase effective prefix)
  const appPrefixes = ['App']; // For components App*
  const filePath = 'dummy.tsx'; // File path is not used due to fs mock

  const emptyExpectedResult = () => ({
    components: {},
    propValues: {},
    directives: {},
    internalComponents: {},
    outsideComponents: {},
    classes: {},
  });

  beforeEach(() => {
    // Clear any previous mock calls if necessary, though setting returnValue per test is usually sufficient
    fs.readFileSync.mockClear();
  });

  test('should return empty results for empty JSX string', () => {
    const jsx = '';
    fs.readFileSync.mockReturnValue(jsx);
    const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);
    expect(result).toEqual(emptyExpectedResult());
  });

  test('should return empty results for JSX with no relevant elements', () => {
    const jsx = '<div><span>Just some text</span><p className="other-class"></p></div>';
    fs.readFileSync.mockReturnValue(jsx);
    const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);
    expect(result).toEqual(emptyExpectedResult());
  });

  // 1. DS Component Detection
  describe('DS Component Detection', () => {
    test('should detect a simple DS component and its count', () => {
      const jsx = '<NbButton /><NbButton />';
      fs.readFileSync.mockReturnValue(jsx);
      const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);
      expect(result.components['NbButton']).toBe(2);
    });

    test('should detect different DS components', () => {
      const jsx = '<NbButton /><NbCard />';
      fs.readFileSync.mockReturnValue(jsx);
      const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);
      expect(result.components['NbButton']).toBe(1);
      expect(result.components['NbCard']).toBe(1);
    });
  });

  // 2. Prop Value Extraction (Enhanced)
  describe('Prop Value Extraction', () => {
    test('should extract various prop types correctly', () => {
      const jsx = `
        <NbComponent
          stringProp="hello"
          numberProp={123}
          boolPropTrue={true}
          boolPropFalse={false}
          shorthandProp
          exprStringProp={'world'}
          shorthandPropWithValue="value"
        />`;
      // shorthandPropWithValue is a normal prop, not a boolean shorthand if it has a value
      fs.readFileSync.mockReturnValue(jsx);
      const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);
      const props = result.propValues['NbComponent'];
      expect(props['stringProp']).toEqual(['hello']);
      expect(props['numberProp']).toEqual([123]);
      expect(props['boolPropTrue']).toEqual([true]);
      expect(props['boolPropFalse']).toEqual([false]);
      expect(props['shorthandProp']).toEqual([true]);
      expect(props['exprStringProp']).toEqual(['world']);
      expect(props['shorthandPropWithValue']).toEqual(['value']);
    });

    test('should store unique prop values only', () => {
      const jsx = '<NbInput value="Hello" count={1} count={1} enabled enabled={true} />';
      fs.readFileSync.mockReturnValue(jsx);
      const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);
      const props = result.propValues['NbInput'];
      expect(props['value'].sort()).toEqual(['Hello'].sort());
      expect(props['count'].sort()).toEqual([1].sort());
      expect(props['enabled'].sort()).toEqual([true].sort());
    });
  });

  // 3. Directive Detection & Counting (Refined)
  describe('Directive Detection & Counting', () => {
    test('should detect directives on DS components and non-DS HTML elements', () => {
      const jsx = '<NbButton nbLogEvent /><div nbTooltip="Info here" /><NbCard nbTrackHover />';
      fs.readFileSync.mockReturnValue(jsx);
      const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);
      expect(result.directives['nbLogEvent']).toBe(1);
      expect(result.directives['nbTooltip']).toBe(1);
      expect(result.directives['nbTrackHover']).toBe(1);
    });

    test('should not count an attribute identical to a (case-insensitive) prefix as a directive', () => {
      const jsx = '<NbCard nb="isPrefix" nbDirectiveValid />'; // 'Nb' from dsPrefixes, 'nb' is its lowercase
      fs.readFileSync.mockReturnValue(jsx);
      const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);
      expect(result.directives['nb']).toBeUndefined();
      expect(result.directives['nbDirectiveValid']).toBe(1);
    });

    test('should only count directives with specified dsPrefixes (case insensitive for prefix part)', () => {
        const jsx = '<div nbValidDirective OtherDirective anotherNbDirective /> <NbComponent NbActualDirective />';
        // nbValidDirective starts with 'nb' (from 'Nb')
        // anotherNbDirective starts with 'anotherNb' which is not 'nb'
        // NbActualDirective starts with 'Nb' (from 'Nb')
        fs.readFileSync.mockReturnValue(jsx);
        const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);
        expect(result.directives['nbValidDirective']).toBe(1);
        expect(result.directives['NbActualDirective']).toBe(1); // Original case is preserved
        expect(result.directives['OtherDirective']).toBeUndefined();
        expect(result.directives['anotherNbDirective']).toBeUndefined();
    });
  });

  // 4. CSS Class Extraction & Counting
  describe('CSS Class Extraction & Counting', () => {
    test('should extract classes from className (StringLiteral)', () => {
      const jsx = '<div className="nb-alert nb-alert-info extra"></div>';
      fs.readFileSync.mockReturnValue(jsx);
      const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);
      expect(result.classes['nb-alert']).toBe(1);
      expect(result.classes['nb-alert-info']).toBe(1);
      expect(result.classes['extra']).toBeUndefined();
    });

    test('should extract classes from `class` prop (StringLiteral)', () => {
      const jsx = '<div class="nb-label my-custom"></div>'; // Less common in React but possible
      fs.readFileSync.mockReturnValue(jsx);
      const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);
      expect(result.classes['nb-label']).toBe(1);
      expect(result.classes['my-custom']).toBeUndefined();
    });

    test('should extract classes from className (JSXExpressionContainer with StringLiteral)', () => {
      const jsx = "<div className={'nb-button nb-button--primary'}></div>";
      fs.readFileSync.mockReturnValue(jsx);
      const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);
      expect(result.classes['nb-button']).toBe(1);
      expect(result.classes['nb-button--primary']).toBe(1);
    });

    test('should extract classes from className (JSXExpressionContainer with TemplateLiteral)', () => {
      const jsx = '<div className={`nb-card ${isActive ? "nb-card--active" : ""} nb-theme-dark extra-${"dynamic"}`}></div>';
      fs.readFileSync.mockReturnValue(jsx);
      const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);
      expect(result.classes['nb-card']).toBe(1);
      expect(result.classes['nb-card--active']).toBe(1); // From quasi
      expect(result.classes['nb-theme-dark']).toBe(1);
      expect(result.classes['extra-']).toBeUndefined(); // Assuming dynamic parts are not fully resolved or only static parts of quasis are used
    });
  });

  // 5. Internal Component Detection
  describe('Internal Component Detection', () => {
    test('should detect internal components based on appPrefixes', () => {
      const jsx = '<AppHeader /><AppFooter /><AppHeader />';
      fs.readFileSync.mockReturnValue(jsx);
      const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);
      expect(result.internalComponents['AppHeader']).toBe(2);
      expect(result.internalComponents['AppFooter']).toBe(1);
    });
  });

  // 6. Outside Component Detection
  describe('Outside Component Detection', () => {
    test('should detect outside custom components', () => {
      const jsx = '<OtherComponent /><AnotherOne />';
      fs.readFileSync.mockReturnValue(jsx);
      const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);
      expect(result.outsideComponents['OtherComponent']).toBe(1);
      expect(result.outsideComponents['AnotherOne']).toBe(1);
    });

    test('should not count standard HTML elements (lowercase) as outside components', () => {
      const jsx = '<div><span></span><MyCustomTag /></div>'; // MyCustomTag is an outside component
      fs.readFileSync.mockReturnValue(jsx);
      const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);
      expect(result.outsideComponents['div']).toBeUndefined();
      expect(result.outsideComponents['span']).toBeUndefined();
      expect(result.outsideComponents['MyCustomTag']).toBe(1);
    });

    test('should not count DS or App components as outside components', () => {
      const jsx = '<NbButton /><AppHeader /><ThirdPartyWidget />';
      fs.readFileSync.mockReturnValue(jsx);
      const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);
      expect(result.outsideComponents['NbButton']).toBeUndefined();
      expect(result.outsideComponents['AppHeader']).toBeUndefined();
      expect(result.outsideComponents['ThirdPartyWidget']).toBe(1);
    });
  });

  // 8. Complex JSX Structure
  describe('Complex JSX Structure', () => {
    test('should correctly parse a mix of features in complex JSX', () => {
      const jsx = `
        <>
          <NbCard nbDirective className={\`nb-card \${true ? 'nb-card-active' : ''}\`}>
            <AppHeader title="Welcome" />
            <NbTabs count={3} onSelected={() => {}}>
              <NbTab title="Tab 1" disabled>
                <div nbItem className="nb-item-class">
                  <p>Content here.</p>
                  <CustomWidget data-value="test" />
                </div>
              </NbTab>
            </NbTabs>
            <NbButton primary nbAction="submit">Submit</NbButton>
          </NbCard>
          <div class="nb-footer">Footer text</div>
        </>
      `;
      fs.readFileSync.mockReturnValue(jsx);
      const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);

      // Components
      expect(result.components['NbCard']).toBe(1);
      expect(result.components['NbTabs']).toBe(1);
      expect(result.components['NbTab']).toBe(1);
      expect(result.components['NbButton']).toBe(1);

      // Internal Components
      expect(result.internalComponents['AppHeader']).toBe(1);

      // Outside Components
      expect(result.outsideComponents['CustomWidget']).toBe(1);

      // PropValues
      expect(result.propValues['NbCard']['nbDirective']).toEqual([true]); // This is a prop, not a directive due to case
      expect(result.propValues['AppHeader']['title']).toEqual(['Welcome']);
      expect(result.propValues['NbTabs']['count']).toEqual([3]);
      expect(result.propValues['NbTabs']['onSelected']).toBeDefined(); // Function expressions are not extracted as values
      expect(result.propValues['NbTab']['title']).toEqual(['Tab 1']);
      expect(result.propValues['NbTab']['disabled']).toEqual([true]);
      expect(result.propValues['NbButton']['primary']).toEqual([true]);
      expect(result.propValues['NbButton']['nbAction']).toEqual(['submit']); // Prop, not directive due to case of 'NbAction' vs 'nbaction'

      // Directives (attribute name starts with 'nb' (lowercase of 'Nb') and is longer than 'nb')
      // nbDirective on NbCard: propName 'nbDirective'.toLowerCase() is 'nbdirective'. prefix 'nb'. 'nbdirective'.startsWith('nb') && 'nbdirective'.length > 'nb'.length. This is a directive.
      // nbAction on NbButton: propName 'nbAction'.toLowerCase() is 'nbaction'. prefix 'nb'. 'nbaction'.startsWith('nb') && 'nbaction'.length > 'nb'.length. This is a directive.
      // nbItem on div: propName 'nbItem'.toLowerCase() is 'nbitem'. prefix 'nb'. 'nbitem'.startsWith('nb') && 'nbitem'.length > 'nb'.length. This is a directive.
      // The previous prop value test: `expect(result.propValues['NbCard']['nbDirective']).toEqual([true]);` is correct because attributes are always processed for prop values if on a DS component.
      // Whether it's *also* a directive is a separate check.
      expect(result.directives['nbDirective']).toBe(1);
      expect(result.directives['nbAction']).toBe(1);
      expect(result.directives['nbItem']).toBe(1);


      // Classes (class prefix 'nb-')
      expect(result.classes['nb-card']).toBe(1);
      expect(result.classes['nb-card-active']).toBe(1);
      expect(result.classes['nb-item-class']).toBe(1);
      expect(result.classes['nb-footer']).toBe(1);
    });
  });

  // 9. Prefix Specificity
  describe('Prefix Specificity', () => {
    test('should only pick up items matching defined prefixes', () => {
      const jsx = `
        <NbButton nbMyDirective className="nb-btn-class" />
        <AppItem appMyDirective className="app-item-class" />
        <OtherComponent otherDirective className="other-class" />
        <div nbAnotherDirective class="nb-div-class"></div>
      `;
      fs.readFileSync.mockReturnValue(jsx);
      const result = extractJsxUsage(filePath, dsPrefixes, appPrefixes);

      // DS items (DS Prefix 'Nb', effective directive/class prefix 'nb')
      expect(result.components['NbButton']).toBe(1);
      expect(result.directives['nbMyDirective']).toBe(1);
      expect(result.directives['nbAnotherDirective']).toBe(1);
      expect(result.classes['nb-btn-class']).toBe(1);
      expect(result.classes['nb-div-class']).toBe(1);

      // App items (App Prefix 'App')
      expect(result.internalComponents['AppItem']).toBe(1);
      // Directives and classes are not checked against appPrefixes by default in extractJsxUsage
      expect(result.directives['appMyDirective']).toBeUndefined();
      expect(result.classes['app-item-class']).toBeUndefined();

      // Other items
      expect(result.outsideComponents['OtherComponent']).toBe(1);
      expect(result.directives['otherDirective']).toBeUndefined();
      expect(result.classes['other-class']).toBeUndefined();
    });
  });
});
