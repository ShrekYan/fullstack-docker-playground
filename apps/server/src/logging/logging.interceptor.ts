import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import type { Logger as PinoLogger } from "pino";
import { tap } from "rxjs/operators";
import { HEALTH_PREFIX, LOG_BODY, MAX_BODY_LENGTH, redactObject } from "./logging.config";


/** 循环引用安全的截断：任何值转成安全字符串且限制长度 */
function safeTruncate(value: unknown): unknown {
    if (value === undefined) return undefined;
    if (value === null) return null;
    let str: string;
    if (typeof value === "string") {
        str = value;
    } else {
        try {
            str = JSON.stringify(value) ?? String(value);
        } catch {
            // 循环引用或 BigInt 等 JSON.stringify 失败的场景
            str = String(value);
        }
    }
    return str.length > MAX_BODY_LENGTH ? str.slice(0, MAX_BODY_LENGTH) + "...(truncated)" : str;
}

type RequestWithLog = Request & { log?: PinoLogger; id?: unknown };

export class LoggingInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler) {
        // 全局拦截器会覆盖所有传输类型，非 HTTP 直接放行
        if (context.getType() !== "http") return next.handle();

        const http = context.switchToHttp();
        const req = http.getRequest<RequestWithLog>();
        const res = http.getResponse<Response>();
        const handler = `${context.getClass().name}.${context.getHandler().name}`;
        const start = Date.now();

        // 探活流量完全静音
        if (req.url.startsWith(HEALTH_PREFIX)) return next.handle();

        req.log?.info(
            {
                event: "request",
                handler,
                method: req.method,
                url: req.url,
                query: req.query,
                ...(LOG_BODY ? { body: safeTruncate(redactObject(req.body)) } : {}),
            },
            " incoming request",
        );

        return next.handle().pipe(
            tap({
                next: (data) => {
                    const status = res.statusCode;
                    const level = status >= 500 ? "error" : status >=400 ? "warn":"info";
                    req.log?.[level](
                        {
                            event: "response",
                            handler,
                            status: res.statusCode,
                            duration: Date.now() - start,
                            ...(LOG_BODY ? { body: safeTruncate(redactObject(data)) } : {}),
                        },
                        " otgoing reponse",
                    );
                },
                error: (err) => {
                    const isHttp = err instanceof HttpException;
                    req.log?.error(
                        {
                            event: "error",
                            handler,
                            status: isHttp ? err.getStatus() : 500,
                            duration: Date.now() - start,
                            error: isHttp ? safeTruncate(err.getResponse()) : String(err),
                            ...(isHttp ? {} : { stack: (err as Error)?.stack }),
                        },

                        "request failed",
                    );
                },
            }),
        );
    }
}
