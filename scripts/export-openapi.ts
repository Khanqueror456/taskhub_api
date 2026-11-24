import { writeFileSync } from 'node:fs';
import { openApiDocument } from '../src/docs/openapi.js';

writeFileSync('openapi.json', JSON.stringify(openApiDocument, null, 2));
console.log('Wrote openapi.json');