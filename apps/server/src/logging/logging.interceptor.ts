import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import type { Logger as PinoLogger } from "pino";
import { tap } from "rxjs/operators";
import { HEALTH_PREFIX, LOG_BODY, redactObject, safeTruncate } from "./logging.config";

type RequestWithLog = Request & { log?: PinoLogger };

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler) {
        // 全局拦截器会覆盖所有传输类型，非 HTTP 直接放行
        if (context.getType() !== "http") return next.handle();

        const http = context.switchToHttp();
        const req = http.getRequest<RequestWithLog>();
        const res = http.getResponse<Response>();

        // 探活流量完全静音
        if (req.url.startsWith(HEALTH_PREFIX)) return next.handle();

        const handler = `${context.getClass().name}.${context.getHandler().name}`;

        // 给 pino-http 的 customSuccessObject / customErrorObject 用
        res.locals.handler = handler;

        return next.handle().pipe(
            tap((data) => {
                if (LOG_BODY) {
                    res.locals.responseBody = safeTruncate(redactObject(data));
                }
            }),
        );
    }
}
