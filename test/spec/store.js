import * as store from '../../src/store';

describe('store:', () => {
  let Model;
  const test = (fn, values) => (done) => store.set(Model, values).then(fn).then(done);

  describe('disconnected', () => {
    describe('model with "id" key -', () => {
      beforeEach(() => {
        Model = {
          id: true,
          string: 'value',
          number: 1,
          bool: false,
          computed: ({ string }) => `This is the string: ${string}`,
          nestedObject: {
            value: 'test',
          },
          nestedExternalObject: {
            id: true,
            value: 'test',
          },
          nestedArrayOfPrimitives: ['one', 'two'],
          nestedArrayOfObjects: [{ one: 'two' }],
          nestedArrayOfExternalObjects: [{ id: true, value: 'test' }],
        };
      });

      describe('get()', () => {
        it('throws for wrong arguments', () => {
          expect(() => store.get()).toThrow();
        });

        it('throws for model definition with wrongly set "id" key', () => {
          expect(() => store.get({ id: 1 }, '1')).toThrow();
        });

        it('throws if property value is not string, number or boolean', () => {
          expect(() => store.get({ value: undefined })).toThrow();
        });

        it('returns null for not defined model', () => {
          expect(store.get(Model, '1')).toBe(null);
        });

        it('returns default values', test((model) => {
          expect(model).toEqual({
            string: 'value',
            number: 1,
            bool: false,
            nestedObject: {
              value: 'test',
            },
            nestedExternalObject: null,
            nestedArrayOfPrimitives: ['one', 'two'],
            nestedArrayOfObjects: [{ one: 'two' }],
            nestedArrayOfExternalObjects: [],
          });
        }));

        it('returns cached model', test((model) => {
          expect(store.get(Model, model.id)).toBe(model);
        }));

        it('returns computed property', test((model) => {
          expect(model.computed).toBe('This is the string: value');
        }));
      });

      describe('set()', () => {
        it('throws if values are not an object or null', test((model) => {
          expect(() => store.set(model, false)).toThrow();
        }));

        it('throws when updates nested object with different model', test(
          (model) => store.set({ test: 'value' }).then((otherModel) => {
            expect(() => store.set(model, { nestedExternalObject: otherModel })).toThrow();
          }),
        ));

        it('creates uuid for objects with "id" key', test((model) => {
          expect(model.id).toBeDefined();
          expect(model.nestedObject.id).not.toBeDefined();
          expect(model.nestedArrayOfObjects[0].id).not.toBeDefined();
        }));

        it('returns the same model', test(
          (model) => store.set(model, model).then((newModel) => {
            expect(newModel).toBe(model);
          }),
        ));

        it('updates single property', test(
          (model) => store.set(model, { string: 'new value' }).then((newModel) => {
            expect(newModel.string).toBe('new value');
            expect(newModel.number).toBe(1);
            expect(newModel.bool).toBe(false);
            expect(newModel.nestedObject).toBe(model.nestedObject);
            expect(newModel.nestedArrayOfObjects).toBe(newModel.nestedArrayOfObjects);
            expect(newModel.nestedArrayOfPrimitives).toBe(newModel.nestedArrayOfPrimitives);
          }),
        ));

        it('updates nested object', test(
          (model) => store.set(model, { nestedObject: { value: 'other' } }).then((newModel) => {
            expect(newModel.nestedObject).toEqual({ value: 'other' });
          }),
        ));

        it('updates nested array of primitives', test(
          (model) => store.set(model, { nestedArrayOfPrimitives: [1, 2, 3] }).then((newModel) => {
            expect(newModel.nestedArrayOfPrimitives).toEqual(['1', '2', '3']);
          }),
        ));

        it('updates nested array of objects', test(
          (model) => store.set(model, { nestedArrayOfObjects: [{ one: 'three' }] }).then((newModel) => {
            expect(newModel.nestedArrayOfObjects).toEqual([{ one: 'three' }]);
          }),
        ));

        it('deletes model', test(
          (model) => store.set(model, null).then((newModel) => {
            expect(newModel).toBe(null);
            expect(store.get(Model, model.id)).toBe(null);
          }),
        ));
      });
    });

    describe('model without "id" key -', () => {
      beforeEach(() => {
        Model = {
          value: 'test',
        };
      });

      describe('get()', () => {
        it('throws when called with parameters', () => {
          expect(() => store.get(Model, '1')).toThrow();
        });

        it('returns singleton instance of the model', () => {
          const model = store.get(Model);
          expect(model).toEqual({ value: 'test' });
        });
      });

      describe('set()', () => {
        it('always set the same instance', test((model) => {
          expect(model).toEqual({ value: 'test' });
          return store.set(Model, { value: 'other' }).then((newModel) => {
            expect(store.get(Model)).toBe(newModel);
          });
        }));
      });
    });
  });
});
