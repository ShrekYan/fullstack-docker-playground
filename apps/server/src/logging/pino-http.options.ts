import { HttpException } from "@nestjs/common";
import { IncomingMessage, ServerResponse } from "node:http";
import type { Request as ExpressRequest } from "express";
import type { Options } from "pino-http";
import { HEALTH_PREFIX, LOG_BODY, REDACT_PATHS, generateRequestId, levelForStatus, redactObject, safeTruncate } from "./logging.config";
import { chinaTime } from "./time";

type LoggableRequest = IncomingMessage & { id?: string };
type LoggableResponse = ServerResponse & { locals: Record<string, unknown> };

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
                query,
                ...(LOG_BODY ? { body: safeTruncate(redactObject(body)) } : {}),
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
                duration: val?.responseTime,
                ...(!failed && LOG_BODY && locals.responseBody !== undefined ? { body: locals.responseBody } : {}),
            };
        },
        // 5xx / 未捕获异常 / 带 res.err 的 4xx 的日志结构
        customErrorObject: (_req, res, error, val) => {
            const r = res as LoggableResponse;
            const locals = r.locals ?? {};
            const isHttp = error instanceof HttpException;

            const payload: Record<string, unknown> = {
                event: { name: "http.request.failed" },
                handler: locals.handler ?? "unmatched",
                status: isHttp ? error.getStatus() : r.statusCode,
                duration: val?.responseTime,
                err: isHttp
                    ? {
                          type: error.name,
                          message: error.message,
                          details: safeTruncate(redactObject(error.getResponse())),
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
                return {
                    request_id: r.id,
                    method: r.method,
                    url: safeTruncate(r.url),
                };
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
                                  limit: { count: 14 },
                                  mkdir: true,
                              },
                              level: process.env.LOG_LEVEL ?? "info",
                          },
                      ],
                  },
    };
}
