import { createRequire } from 'node:module';

// ajv and ajv-formats are CommonJS packages; createRequire avoids ESM default-import typing quirks
const require = createRequire(import.meta.url);

interface Validator {
  (data: unknown): boolean;
  errors?: { instancePath: string; message?: string }[] | null;
}
const Ajv2020 = require('ajv/dist/2020') as new (options: object) => {
  compile: (schema: object) => Validator;
};
const addFormats = require('ajv-formats') as (ajv: unknown) => void;

/** Returns a function that lists how a value violates a named schema (empty list = valid). */
export function createSchemaChecker(schemas: Record<string, object>) {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  const compiled = new Map<string, Validator>();

  return (name: string, value: unknown): string[] => {
    const schema = schemas[name];
    if (!schema) throw new Error(`The OpenAPI document has no schema named "${name}"`);

    let validate = compiled.get(name);
    if (!validate) {
      validate = ajv.compile(schema);
      compiled.set(name, validate);
    }
    return validate(value)
      ? []
      : (validate.errors ?? []).map((e) => `${e.instancePath || '(root)'} ${e.message}`);
  };
}