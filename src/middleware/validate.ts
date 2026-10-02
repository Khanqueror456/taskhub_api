import type { RequestHandler } from "express";
import type {z} from "zod";
import { AppError } from "../utils/AppError.js";


interface Schemas {

    body?: z.ZodType;
    query?: z.ZodType;
    params?: z.ZodType;
}

export const validate = 
(schemas : Schemas) : RequestHandler => 
(req, _res, next) => {

    for (const key of ['body', 'query', 'params'] as const) {
        const schema = schemas[key];
        if (!schema) continue;

        const result = schema.safeParse(req[key]);
        if (!result.success)
        {
            const details = result.error.issues.map((issue) => ({
                path : [key, ...issue.path.map(String)].join('.'),
                message : issue.message
            }));

            return next(AppError.badRequest('Validation failed', details));
        }

         // Express 5 makes req.query a read-only getter, so we redefine the property
         Object.defineProperty(req, key, {
            value : result.data,
            writable : true,
            configurable : true,
            enumerable : true,
         });
    }

    next();
}