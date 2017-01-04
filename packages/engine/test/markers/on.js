import { define } from '@hybrids/core';
import engine from '../../src/engine';

import { MARKER_PREFIX as M } from '../../src/template';
import { LOCALS_PREFIX as L } from '../../src/expression';

describe('Engine | Markers | On -', () => {
  let el;
  let spy;

  beforeAll(() => {
    class EngineMarkersOnTest {
      static get options() {
        return {
          providers: [engine],
          template: `
            <template ${M}for="items">
              <div id="one" ${M}on="click"></div>
            </template>
          `
        };
      }

      constructor() {
        this.items = [0];
      }

      click(...args) {
        spy(...args);
      }
    }

    define({ EngineMarkersOnTest });
  });

  beforeEach(() => {
    spy = jasmine.createSpy('click callback');
    el = document.createElement('engine-markers-on-test');
    document.body.appendChild(el);
  });

  afterEach(() => {
    document.body.removeChild(el);
  });

  function getId(id) {
    return el.shadowRoot.querySelector(`#${id}`);
  }

  rafIt('call event handler', () => {
    getId('one').click();
    requestAnimationFrame(() => {
      const { args } = spy.calls.mostRecent();
      expect(spy).toHaveBeenCalled();
      expect(args[0]).toEqual(jasmine.objectContaining({ item: 0 }));
      expect(args[0][`${L}event`].target).toEqual(el);
    });
  });
});