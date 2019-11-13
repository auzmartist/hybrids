/* eslint-disable no-use-before-define */
import * as cache from './cache';

function getTypeConstructor(type) {
  switch (type) {
    case 'string': return String;
    case 'number': return Number;
    case 'boolean': return Boolean;
    default: throw TypeError(`Property type must be string, number or boolean: ${type}`);
  }
}

// UUID v4 generator thanks to https://gist.github.com/jed/982883
function uuid(temp) {
  return temp
    // eslint-disable-next-line no-bitwise, no-mixed-operators
    ? (temp ^ Math.random() * 16 >> temp / 4).toString(16)
    : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, uuid);
}

export const connect = `__store__connect__${Date.now()}__`;
const _ = (h, v) => v;

function setupStorage(storage) {
  return storage;
}

const models = new WeakMap();
const configs = new WeakMap();

function setupModel(Model) {
  if (typeof Model !== 'object' || Model === null) {
    throw TypeError(`Model definition must be an object: ${typeof Model}`);
  }
  let config = configs.get(Model);

  if (!config) {
    config = { external: hasOwnProperty.call(Model, 'id') };
    if (hasOwnProperty.call(Model, connect)) {
      Object.assign(config, setupStorage(Model[connect]));
      delete Model[connect];
    } else {
      Object.assign(config, {
        get: config.external ? () => {} : () => config.create({}),
        set: () => {},
        list: (parameters) => {
          if (parameters) throw TypeError('Not connected model does not support parameters');
          return cache.getEntries(Model).reduce((acc, { key, value }) => {
            if (value) acc.push(key);
            return acc;
          }, []);
        },
      });
    }

    const transform = Object.keys(Object.freeze(Model)).map((key) => {
      if (key === 'id') {
        if (Model[key] !== true) {
          throw TypeError(`'id' key must be set to true or not defined: ${typeof Model[key]}`);
        }
        return (model, data, lastModel) => {
          const id = lastModel
            ? lastModel.id
            : (hasOwnProperty.call(data, 'id') && String(data.id)) || String(uuid());
          Object.defineProperty(model, 'id', { value: id });
        };
      }

      const type = typeof Model[key];
      const defaultValue = Model[key];

      switch (type) {
        case 'function': return (model) => {
          Object.defineProperty(model, key, {
            get() { return cache.get(this, key, defaultValue); },
          });
        };
        case 'object': if (defaultValue) {
          const isArray = Array.isArray(defaultValue);

          if (isArray) {
            const nestedType = typeof defaultValue[0];
            if (nestedType !== 'object' || defaultValue[0] === null) {
              const Constructor = getTypeConstructor(nestedType);
              const defaultArray = Object.freeze(defaultValue.map(Constructor));
              return (model, data, lastModel) => {
                if (hasOwnProperty.call(data, key)) {
                  model[key] = data[key].map(Constructor);
                } else if (lastModel && hasOwnProperty.call(lastModel, key)) {
                  model[key] = lastModel[key];
                } else {
                  model[key] = defaultArray;
                }
              };
            }

            const nestedConfig = bootstrap(defaultValue);
            return (model, data, lastModel) => {
              if (hasOwnProperty.call(data, key)) {
                if (!Array.isArray(data[key])) {
                  throw TypeError(`List of models must be an array: ${typeof data[key]}`);
                }
                model[key] = nestedConfig.create(data[key]);
              } else {
                model[key] = (lastModel && lastModel[key]) || (
                  nestedConfig.external ? [] : nestedConfig.create(defaultValue)
                );
              }
            };
          }

          const nestedConfig = bootstrap(defaultValue);
          if (nestedConfig.external) {
            return (model, data, lastModel) => {
              let resultModel;

              if (hasOwnProperty.call(data, key)) {
                const nestedData = data[key];
                if (typeof nestedData !== 'object') {
                  resultModel = { id: nestedData };
                } else {
                  const dataModel = models.get(nestedData);
                  if (dataModel) {
                    if (dataModel && dataModel !== defaultValue) {
                      throw TypeError('Model instance must match model definition');
                    }
                    resultModel = nestedData;
                  } else {
                    resultModel = nestedConfig.create(nestedData);
                    sync(nestedConfig, resultModel.id, resultModel);
                  }
                }
              } else {
                resultModel = lastModel && lastModel[key];
              }

              if (resultModel) {
                const id = resultModel.id;
                Object.defineProperty(model, key, {
                  get: () => get(defaultValue, id), enumerable: true,
                });
              } else {
                model[key] = null;
              }
            };
          }

          return (model, data, lastModel) => {
            if (hasOwnProperty.call(data, key)) {
              model[key] = nestedConfig.create(data[key], lastModel[key]);
            } else {
              model[key] = lastModel ? lastModel[key] : nestedConfig.create({});
            }
          };
        }
        // eslint-disable-next-line no-fallthrough
        default: {
          const Constructor = getTypeConstructor(type);
          return (model, data, lastModel) => {
            if (hasOwnProperty.call(data, key)) {
              model[key] = Constructor(data[key]);
            } else if (lastModel && hasOwnProperty.call(lastModel, key)) {
              model[key] = lastModel[key];
            } else {
              model[key] = defaultValue;
            }
          };
        }
      }
    });

    config.create = function create(data, lastModel) {
      if (data === null) return null;
      if (lastModel !== undefined && data === lastModel) return lastModel;

      if (typeof data !== 'object') {
        throw TypeError(`Model instance must be an object or null: ${typeof data}`);
      }

      const model = transform.reduce((acc, fn) => {
        fn(acc, data, lastModel);
        return acc;
      }, {});

      models.set(model, Model);
      if (lastModel) models.delete(lastModel);

      return Object.freeze(model);
    };

    configs.set(Model, Object.freeze(config));
  }

  return config;
}

const lists = new WeakMap();
function setupListModel(Model) {
  let config = lists.get(Model);

  if (!config) {
    const modelConfig = setupModel(Model);
    config = {
      external: modelConfig.external,
      get: modelConfig.list,
      create(items) {
        const result = items.reduce((acc, data) => {
          let id = data;
          if (typeof data === 'object' && data !== null) {
            id = data.id;
            const dataModel = models.get(data);
            if (dataModel) {
              if (dataModel && dataModel !== Model) {
                throw TypeError('Model instance must match model definition');
              }
            } else {
              const model = modelConfig.create(data);
              id = model.id;
              if (modelConfig.external) {
                sync(modelConfig, id, model);
              } else {
                acc.push(model);
              }
            }
          } else if (!modelConfig.external) {
            throw TypeError(`Model instance must be an object: ${typeof data}`);
          }
          if (modelConfig.external) {
            Object.defineProperty(acc, acc.length, {
              get: () => get(Model, id),
              enumerable: true,
            });
          }
          return acc;
        }, []);

        return Object.freeze(result);
      },
    };
    lists.set(Model, config);
  }

  return config;
}

function bootstrap(Model) {
  return Array.isArray(Model) ? setupListModel(Model[0]) : setupModel(Model);
}

function sync(config, id, model) {
  cache.set(config, id, _, model, true);
  return model;
}

function stringifyParameters(parameters) {
  return typeof parameters === 'object'
    ? JSON.stringify(
      Object.keys(parameters).sort().reduce((acc, key) => {
        if (typeof parameters[key] === 'object' && parameters[key] !== null) {
          throw TypeError(`You must use primitive value for '${key}' key: ${typeof parameters[key]}`);
        }
        acc[key] = parameters[key];
        return acc;
      }, {}),
    )
    : String(parameters);
}

export function get(Model, parameters) {
  const config = bootstrap(Model);
  let id;

  if (config.external) {
    id = stringifyParameters(parameters);
  } else if (parameters !== undefined) {
    throw TypeError("Model without 'id' key does not support parameters");
  }

  return cache.get(config, id, (h, cachedModel) => {
    if (cachedModel) return cachedModel;
    const result = config.get(parameters) || null;

    if (result instanceof Promise) {
      return result.then(
        (data) => { sync(config, id, config.create(data)); },
        (error) => { sync(config, id, error); },
      );
    }

    return config.create(result);
  });
}

export function set(model, values = {}) {
  const Model = models.get(model) || model;
  const config = bootstrap(Model);

  if (!config.set) {
    throw TypeError("Provided model does not support 'set' action.");
  }

  const localModel = config.create(values, Model === model ? undefined : model);
  const id = (localModel && localModel.id) || model.id;
  const result = config.set(Model === model ? undefined : id, localModel);

  return Promise.resolve(result).then((data) => {
    const resultModel = data !== undefined ? config.create(data) : localModel;
    return sync(config, id || (resultModel && resultModel.id), resultModel);
  });
}

export default function store() {}
