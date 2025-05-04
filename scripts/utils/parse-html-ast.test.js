import { extractHtmlUsage } from './parse-html-ast.js';

describe('extractHtmlUsage', () => {
  const dsPrefixes = ['nb']; // For components nb-*, directives nb* (lowercase for HTML)
  const appPrefixes = ['app']; // For components app-*

  const emptyExpectedResult = () => ({
    components: {},
    propValues: {},
    directives: {},
    outsideComponents: {},
    internalComponents: {},
    classes: {},
  });

  test('should return empty results for empty HTML string', () => {
    const html = '';
    const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
    expect(result).toEqual(emptyExpectedResult());
  });

  test('should return empty results for HTML with no relevant elements', () => {
    const html = '<div><span>Just some text</span><p class="other-class"></p></div>';
    const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
    expect(result).toEqual(emptyExpectedResult());
  });

  // 1. DS Component Detection
  describe('DS Component Detection', () => {
    test('should detect a simple DS component and its count', () => {
      const html = '<nb-button></nb-button><nb-button></nb-button>';
      const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
      expect(result.components['nb-button']).toBe(2);
    });

    test('should detect different DS components', () => {
      const html = '<nb-button></nb-button><nb-card></nb-card>';
      const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
      expect(result.components['nb-button']).toBe(1);
      expect(result.components['nb-card']).toBe(1);
    });
  });

  // 2. Prop Value Extraction
  describe('Prop Value Extraction', () => {
    test('should extract string props for a DS component', () => {
      const html = '<nb-input value="Hello" type="text"></nb-input>';
      const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
      expect(result.propValues['nb-input']['value']).toEqual(['Hello']);
      expect(result.propValues['nb-input']['type']).toEqual(['text']);
    });

    test('should extract props from different DS components', () => {
      const html = '<nb-input value="Input1"></nb-input><nb-checkbox label="Check"></nb-checkbox>';
      const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
      expect(result.propValues['nb-input']['value']).toEqual(['Input1']);
      expect(result.propValues['nb-checkbox']['label']).toEqual(['Check']);
    });

    test('should store unique prop values only', () => {
      const html = '<nb-input value="Hello" value="Hello"></nb-input>'; // Duplicate attribute in HTML is not standard, parser might take first or last
                                                                    // htmlparser2 takes the last one if attr name is identical, but that's not what we test here.
                                                                    // We test if our logic would add duplicates if source was `[{value:"Hello"}, {value:"Hello"}]`
                                                                    // The current extractHtmlUsage pushes to an array and ensures uniqueness there.
      const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
      expect(result.propValues['nb-input']['value']).toEqual(['Hello']);
    });

    test('should handle DS components with no props', () => {
      const html = '<nb-button></nb-button>';
      const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
      expect(result.propValues['nb-button']).toBeUndefined(); // Or expect({}).toBe({}) depending on initialization
    });
  });

  // 3. Directive Detection & Counting
  describe('Directive Detection & Counting', () => {
    test('should detect directives on DS components and non-DS elements and count them', () => {
      const html = '<nb-button nbTooltip="Click me"></nb-button><div nbTooltip="Info"></div><span nbTooltip="More Info"></span>';
      const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
      expect(result.directives['nbTooltip']).toBe(3);
    });

    test('should not count an attribute that is identical to a prefix as a directive', () => {
      const html = '<nb-card nb="someValue"></nb-card><div nbButton></div>'; // nb is a prefix
      const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
      expect(result.directives['nb']).toBeUndefined();
      expect(result.directives['nbButton']).toBe(1);
    });

    test('should handle and clean Angular-style directive attributes', () => {
      const html = '<div [nbContextualMenu]="menu" (nbCustomEvent)="handler()"></div><p *nbIf="condition"></p>';
      const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
      expect(result.directives['nbContextualMenu']).toBe(1);
      expect(result.directives['nbCustomEvent']).toBe(1); // Assuming event bindings are treated like directives if prefixed
      expect(result.directives['nbIf']).toBe(1);
    });

    test('should only count directives with specified dsPrefixes', () => {
        const html = '<div nbValidDirective otherDirective></div>';
        const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
        expect(result.directives['nbValidDirective']).toBe(1);
        expect(result.directives['otherDirective']).toBeUndefined();
    });
  });

  // 4. CSS Class Extraction & Counting
  describe('CSS Class Extraction & Counting', () => {
    test('should extract and count DS-prefixed classes', () => {
      const html = '<div class="nb-alert nb-alert-info"></div><span class="nb-alert"></span>';
      const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
      expect(result.classes['nb-alert']).toBe(2);
      expect(result.classes['nb-alert-info']).toBe(1);
    });

    test('should only extract DS-prefixed classes and ignore others', () => {
      const html = '<div class="nb-label my-custom-class another"></div>';
      const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
      expect(result.classes['nb-label']).toBe(1);
      expect(result.classes['my-custom-class']).toBeUndefined();
      expect(result.classes['another']).toBeUndefined();
    });
  });

  // 5. Internal Component Detection
  describe('Internal Component Detection', () => {
    test('should detect internal components based on appPrefixes', () => {
      const html = '<app-header></app-header><app-footer></app-footer><app-header></app-header>';
      const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
      expect(result.internalComponents['app-header']).toBe(2);
      expect(result.internalComponents['app-footer']).toBe(1);
    });
  });

  // 6. Outside Component Detection
  describe('Outside Component Detection', () => {
    test('should detect outside custom elements', () => {
      const html = '<other-custom-element></other-custom-element><another-one></another-one>';
      const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
      expect(result.outsideComponents['other-custom-element']).toBe(1);
      expect(result.outsideComponents['another-one']).toBe(1);
    });

    test('should not count standard HTML elements as outside components', () => {
      const html = '<div><span></span><my-custom-tag></my-custom-tag></div>';
      const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
      expect(result.outsideComponents['div']).toBeUndefined();
      expect(result.outsideComponents['span']).toBeUndefined();
      expect(result.outsideComponents['my-custom-tag']).toBe(1); // Assuming my-custom-tag is not app or ds prefixed
    });

     test('should not count DS or App components as outside components', () => {
      const html = '<nb-button></nb-button><app-header></app-header><third-party-widget></third-party-widget>';
      const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);
      expect(result.outsideComponents['nb-button']).toBeUndefined();
      expect(result.outsideComponents['app-header']).toBeUndefined();
      expect(result.outsideComponents['third-party-widget']).toBe(1);
    });
  });

  // 8. Complex HTML Structure (Combination Test)
  describe('Complex HTML Structure', () => {
    test('should correctly parse a mix of features', () => {
      const html = `
        <nb-card nbCardLarge class="nb-m-2 nb-elevation-4">
          <app-header title="Welcome to NbApp" class="nb-header-custom"></app-header>
          <nb-tabs>
            <nb-tab title="Tab 1">
              <div nbImportantText class="content nb-p-3">
                <p>This is a paragraph with <span class="nb-highlight">highlighted</span> text.</p>
                <nb-button nbAction="submit" (click)="doSomething()">Submit</nb-button>
              </div>
            </nb-tab>
          </nb-tabs>
          <another-widget [data]="someData" *ngIf="showWidget"></another-widget>
        </nb-card>
      `;
      // Note: ngIf is not a DS prefix by default. For this test, only nb* directives are DS.
      // For directives, remember dsPrefixes = ['nb'] means we look for attributes starting with 'nb' (lowercase)
      // and are longer than 'nb'.
      const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);

      // Components
      expect(result.components['nb-card']).toBe(1);
      expect(result.components['nb-tabs']).toBe(1);
      expect(result.components['nb-tab']).toBe(1);
      expect(result.components['nb-button']).toBe(1);

      // Internal Components
      expect(result.internalComponents['app-header']).toBe(1);

      // Outside Components
      expect(result.outsideComponents['another-widget']).toBe(1);

      // Prop Values
      expect(result.propValues['nb-card']['nbCardLarge']).toEqual(['']); // attribute present, value is empty string
      expect(result.propValues['app-header']['title']).toEqual(['Welcome to NbApp']);
      expect(result.propValues['nb-tab']['title']).toEqual(['Tab 1']);
      expect(result.propValues['nb-button']['nbAction']).toEqual(['submit']);
      expect(result.propValues['nb-button']['(click)']).toEqual(['doSomething()']); // Attributes are preserved as is
      expect(result.propValues['another-widget']['[data]']).toEqual(['someData']);
      expect(result.propValues['another-widget']['*ngIf']).toEqual(['showWidget']);


      // Directives (attributes starting with 'nb' and longer than 'nb')
      expect(result.directives['nbCardLarge']).toBe(1); // Assuming nbCardLarge is a directive
      expect(result.directives['nbImportantText']).toBe(1);
      expect(result.directives['nbAction']).toBe(1);
      // nbIf would be a directive if 'nb' was the prefix, but here *ngIf is not an 'nb' directive.
      // It will be a prop of another-widget.

      // Classes (class prefix is 'nb-')
      expect(result.classes['nb-m-2']).toBe(1);
      expect(result.classes['nb-elevation-4']).toBe(1);
      expect(result.classes['nb-header-custom']).toBe(1);
      expect(result.classes['nb-p-3']).toBe(1);
      expect(result.classes['nb-highlight']).toBe(1);
    });
  });

  // 9. Prefix Specificity
  describe('Prefix Specificity', () => {
    test('should only pick up items matching defined prefixes', () => {
      const html = `
        <nb-button nbMyDirective class="nb-btn-class"></nb-button>
        <app-item appMyDirective class="app-item-class"></app-item>
        <other-component otherDirective class="other-class"></other-component>
        <div nbAnotherDirective class="nb-div-class"></div>
      `;
      const result = extractHtmlUsage(html, dsPrefixes, appPrefixes);

      // DS items (prefix 'nb')
      expect(result.components['nb-button']).toBe(1);
      expect(result.directives['nbMyDirective']).toBe(1);
      expect(result.directives['nbAnotherDirective']).toBe(1);
      expect(result.classes['nb-btn-class']).toBe(1);
      expect(result.classes['nb-div-class']).toBe(1);

      // App items (prefix 'app')
      expect(result.internalComponents['app-item']).toBe(1);
      expect(result.directives['appMyDirective']).toBeUndefined(); // app directives not configured to be specifically tracked by dsPrefixes
      expect(result.classes['app-item-class']).toBeUndefined(); // app classes not configured

      // Other items
      expect(result.outsideComponents['other-component']).toBe(1);
      expect(result.directives['otherDirective']).toBeUndefined();
      expect(result.classes['other-class']).toBeUndefined();
    });
  });
});
