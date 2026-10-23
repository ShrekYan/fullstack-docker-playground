import { HttpException } from "@nestjs/common";
import { IncomingMessage, ServerResponse } from "node:http";
import type { Request as ExpressRequest } from "express";
import type { Options } from "pino-http";
import { HEALTH_PREFIX, LOG_BODY, REDACT_PATHS, generateRequestId, levelForStatus, sanitizeLogValue, resolveClientIp, truncateHeader, firstHeaderValue, safeTruncate } from "./logging.config";
import { chinaTime } from "./time";

type LoggableRequest = IncomingMessage & { id?: string };
type LoggableResponse = ServerResponse & { locals: Record<string, unknown> };

/**
 * 响应字节数：Express 对 JSON 会自动写 content-length；chunked 响应为空
 * @param res
 * @returns
 */
function responseBytes(res: LoggableResponse) {
    const len = res.getHeader("content-length");
    if (len === undefined) return undefined;
    const n = Number(len);
    return Number.isFinite(n) ? n : undefined;
}

/**
 * 构建 pino-http 配置
 * @returns  pino-http 配置
 */
export function buildPinoHttpOptions(): Options {
    return {
        level: process.env.LOG_LEVEL ?? "info",
        timestamp: chinaTime,
        // 生成请求 ID，用于关联日志和请求
        genReqId: (req, res) => {
            const id = generateRequestId(req.headers["x-request-id"]);
            res.setHeader("x-request-id", id);
            return id;
        },
        //兜底脱敏 （header 已不在日志里，这里防其他日志路径）
        redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },

        //探活静默
        autoLogging: {
            ignore: (req) => req.url?.startsWith(HEALTH_PREFIX) ?? false,
        },
        //状态码日志级别
        customLogLevel: (req, res, err) => {
            return levelForStatus(res.statusCode);
        },
        // 自定义请求日志文案
        customReceivedMessage: () => "incoming request",
        // 自定义请求日志结构
        customReceivedObject: (req) => {
            const { query, body } = req as ExpressRequest;
            return {
                event: { name: "http.request.received" },
                query: sanitizeLogValue(query),
                ...(LOG_BODY ? { body: sanitizeLogValue(body) } : {}),
            };
        },
        //pino-http 的“成功”分支里，用状态码区分文案
        customSuccessMessage: (_req, res) => {
            return res.statusCode >= 400 ? "request failed" : "outgoing response";
        },
        customErrorMessage: () => {
            return "request failed";
        },
        // 成功 / 4xx（含 404、guard 拒绝）的日志结构
        customSuccessObject: (_req, res, val) => {
            const r = res as LoggableResponse;
            const locals = r.locals ?? {};
            const status = r.statusCode;
            const failed = status >= 400;
            return {
                event: { name: failed ? "http.request.failed" : "http.request.completed" },
                handler: locals.handler ?? "unmatched",
                status,
                duration_ms: val?.responseTime,
                response_bytes: responseBytes(r),
                ...(!failed && LOG_BODY && locals.responseBody !== undefined ? { body: locals.responseBody } : {}),
            };
        },
        // 5xx / 未捕获异常 / 带 res.err 的 4xx 的日志结构
        customErrorObject: (_req, res, error, val) => {
            const r = res as LoggableResponse;
            const locals = r.locals ?? {};
            const isHttp = error instanceof HttpException;
            const status = isHttp ? error.getStatus() : r.statusCode;

            const payload: Record<string, unknown> = {
                event: { name: "http.request.failed" },
                handler: locals.handler ?? "unmatched",
                status: isHttp ? error.getStatus() : r.statusCode,
                duration: val?.responseTime,
                response_bytes: responseBytes(r),
                err: isHttp
                    ? {
                          type: error.name,
                          message: error.message,
                          details: sanitizeLogValue(error.getResponse()),
                          ...(status >= 500 ? { stack: safeTruncate(error?.stack) } : {}),
                      }
                    : {
                          type: error?.name ?? "Error",
                          message: safeTruncate(error?.message),
                          stack: safeTruncate(error?.stack),
                      },
            };

            return payload;
        },
        serializers: {
            req: (req) => {
                const r = req as LoggableRequest;
                const client = resolveClientIp(r);
                const url = (r as ExpressRequest).originalUrl ?? r.url;
                return {
                    request_id: r.id,
                    method: r.method,
                    url: safeTruncate(url),
                    path: url ? url.split("?")[0] : undefined,
                    client_ip: client.ip,
                    client_source: client.source,
                    forwarded_for: truncateHeader(r.headers["x-forwarded-for"], 500),
                    user_agent: truncateHeader(r.headers["user-agent"], 256),
                    protocol: firstHeaderValue(r.headers["x-forwarded-proto"]) ?? "http",
                };
            },
            // pino 默认 err serializer 把任何带 string message 的对象都判为 Error
            // （pino-std-serializers isErrorLike），会把手工构造的 err.type 改写成 "Object"。
            // 这里通过 raw 取回原始对象，同时不影响真实 Error 的正常序列化。
            err: (err) => {
                const raw = (err as { raw?: unknown })?.raw;
                return raw && typeof raw === "object" && "type" in raw ? raw : err;
            },
        },
        transport:
            process.env.NODE_ENV !== "production"
                ? { target: "pino-pretty", options: { singleLine: true } }
                : {
                      targets: [
                          { target: "pino/file", options: { destination: 1 } },
                          {
                              target: "pino-roll",
                              options: {
                                  file: process.env.LOG_FILE ?? "/app/logs/server.log",
                                  frequency: "daily",
                                  dateFormat: "yyyy-MM-dd",
                                  size: "20m",
                                  limit: { count: 14, removeOtherLogFiles: true },
                                  mkdir: true,
                              },
                              level: process.env.LOG_LEVEL ?? "info",
                          },
                      ],
                  },
    };
}
