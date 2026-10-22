import { randomUUID } from "node:crypto";

/** 敏感字段脱敏清单：路径命中即被 pino 替换为 [REDACTED] */
export const REDACT_PATHS = ["req.headers.authorization", "req.headers.cookie"];

/** 敏感字段脱敏清单：路径命中即被 pino 替换为 [REDACTED] */
export const SENSITIVE_KEYS = new Set(["password", "passwordConfirm", "token", "accessToken", "refreshToken", "secret", "authorization"]);

/** body 记录开关：线上出问题可随时用环境变量关闭，不用改代码 */
export const LOG_BODY = process.env.LOG_BODY !== "false";

/** 单条 body 最大记录长度，防大响应拖垮磁盘和检索 */
export const MAX_BODY_LENGTH = 2000;

export const HEALTH_PREFIX = "/api/v1/health";

export function generateRequestId(headerValue: string | string[] | undefined) {
    const incoming = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    return incoming ?? randomUUID();
}

export type AppLogLevel = "info" | "warn" | "error";

/** HTTP 状态码 → 日志级别 */
export function levelForStatus(status: number): AppLogLevel {
    if (status >= 500) return "error";
    if (status >= 400) return "warn";
    return "info";
}

/** 循环引用安全的截断：任何值转成安全字符串且限制长度 */
export function safeTruncate(value: unknown): unknown {
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

/**
 * 递归脱敏对象中的敏感字段
 * @param value
 * @returns
 */
export function redactObject(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redactObject);
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            if (SENSITIVE_KEYS.has(k)) {
                out[k] = "[REDACTED]";
            } else {
                out[k] = redactObject(v);
            }
        }
        return out;
    }
    return value;
}
