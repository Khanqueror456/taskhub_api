import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../utils/AppError.js";
import { unknown } from "zod";

export const notFound: RequestHandler = (req, _res, next) => {
    next(AppError.notFound(`Route ${req.method} ${req.path} not found`));
};


// Express recognises error handlers by their 4 arguments, so `_next` must stay
// eslint-disable-next-line @typescript-eslint/no-unused-vars

export const errorHandler : ErrorRequestHandler = (err, req, res, _next) => {

    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong';
    let details: unknown;

    if (err instanceof AppError)
    {
        ({statusCode : status, code, message, details} = err);
    }

    else if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500)
    {
        status = err.status;
        code = 'BAD_REQUEST';
        message = status === 400 ? 'Malformed request' : String(err.message);
    }

    if (status >= 500)
    {
        req.log.error({err}, 'Unhandled error');
    }

    else
    {
        req.log.warn({code, status}, message);
    }

    res.status(status).json({error : {code, message, details, requestId : req.id}});
}