import { randomUUID } from "node:crypto";
import { IncomingMessage } from "node:http";

/** 敏感字段脱敏清单：路径命中即被 pino 替换为 [REDACTED] */
export const REDACT_PATHS = ["req.headers.authorization", "req.headers.cookie"];

/** 敏感字段脱敏清单：路径命中即被 pino 替换为 [REDACTED] */
export const SENSITIVE_KEYS = new Set(["password", "passwordConfirm", "token", "accessToken", "refreshToken", "secret", "authorization"]);

/** body 记录开关：线上出问题可随时用环境变量关闭，不用改代码 */
export const LOG_BODY = process.env.LOG_BODY !== "false";

/** 单条 body 最大记录长度，防大响应拖垮磁盘和检索 */
export const MAX_BODY_LENGTH = 2000;

/** 健康检查路径前缀 */
export const HEALTH_PREFIX = "/api/v1/health";

/** 数组最多记录多少项，防止响应体是千条列表时撑爆日志 */
export const MAX_LOG_ARRAY_ITEMS = 50;

/** 最大递归深度，防止无限循环 */
export const MAX_LOG_DEPTH = 10;

interface SanitizeOptions {
    maxString?: number;
    maxItems?: number;
    maxDepth?: number;
}

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

/**
 * 日志安全化：递归脱敏 + 截断 + 防循环引用。
 * 保留对象结构，便于 Loki/ES 按字段查询；
 * 只对超长字符串、超长数组、过深结构做截断。
 */
export function sanitizeLogValue(value: unknown, options: SanitizeOptions = {}): unknown {
    const maxString = options.maxString ?? MAX_BODY_LENGTH;
    const maxItems = options.maxItems ?? MAX_LOG_ARRAY_ITEMS;
    const maxDepth = options.maxDepth ?? MAX_LOG_DEPTH;
    const seen = new WeakSet<object>();

    function walk(node: unknown, depth: number): unknown {
        if (node === null || node === undefined) return node;

        if (typeof node === "string") {
            return node.length > maxString ? `${node.slice(0, maxString)}...(truncated)` : node;
        }
        if (typeof node === "number" || typeof node === "boolean") return node;
        if (typeof node === "bigint") return node.toString();
        if (typeof node === "function" || typeof node === "symbol") return `[${typeof node}]`;
        if (typeof node !== "object") return String(node);

        if (node instanceof Date) return node.toISOString();
        if (Buffer.isBuffer(node)) return `[Buffer ${node.length} bytes]`;

        if (depth >= maxDepth) return "[MaxDepth]";
        if (seen.has(node)) return "[Circular]";

        seen.add(node);
        let result: unknown;

        if (Array.isArray(node)) {
            const items = node.slice(0, maxItems).map((item) => walk(item, depth + 1));
            if (node.length > maxItems) items.push(`[+${node.length - maxItems} more]`);
            result = items;
        } else {
            const out: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
                out[key] = SENSITIVE_KEYS.has(key) ? "[REDACTED]" : walk(val, depth + 1);
            }
            result = out;
        }

        seen.delete(node); // 只标记“当前递归路径”，避免普通重复引用被误判为环
        return result;
    }

    return walk(value, 0);
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

/* ---------------- 客户端 IP 解析（与网关契约对齐） ---------------- */

export type ClientIpSource = "x-client-ip" | "x-real-ip" | "xff" | "socket";

/** Node 对重复头返回 string[]，统一成字符串 */
function rawHeader(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value.join(", ") : value;
}

/** 取第一个值（单值头），逗号后的部分丢弃 */
export function firstHeaderValue(value: string | string[] | undefined): string | undefined {
    const first = rawHeader(value)?.split(",")[0]?.trim();
    return first || undefined;
}

/** 原样保留（可截断），用于 UA、完整 XFF 链 */
export function truncateHeader(value: string | string[] | undefined, max = 500): string | undefined {
    const raw = rawHeader(value);
    if (!raw) return undefined;
    return raw.length > max ? `${raw.slice(0, max)}...(truncated)` : raw;
}

/** 剥掉 Node 对 IPv4 的 ::ffff: 前缀；nginx 下发的头不会有该前缀，此处是幂等的 */
function normalizeIp(ip: string | undefined): string | undefined {
    return ip?.replace(/^::ffff:/i, "");
}

/**
 * 取客户端 IP。
 * 与网关的契约：X-Client-IP = 网关 access_log 的 client_ip = $remote_addr。
 * 顺序：X-Client-IP → X-Real-IP → XFF 最右 → socket。
 * 注意：绕过网关直连（dev 的 3000 端口）时，这三个头都可被客户端伪造。
 */
export function resolveClientIp(req: IncomingMessage): { ip?: string; source: ClientIpSource } {
    // 1) 契约头：网关用 $remote_addr 覆盖写，与网关日志同源
    const contractIp = firstHeaderValue(req.headers["x-client-ip"]);
    if (contractIp) return { ip: normalizeIp(contractIp), source: "x-client-ip" };

    // 2) 兼容头：同样是覆盖写，值相同
    const realIp = firstHeaderValue(req.headers["x-real-ip"]);
    if (realIp) return { ip: normalizeIp(realIp), source: "x-real-ip" };

    // 3) XFF：网关覆盖写后只有一项；若未来是多级代理，最右一项才是最近一跳写入的
    //    取最左是经典 bug（拿到客户端伪造值）
    const xff = rawHeader(req.headers["x-forwarded-for"]);
    const rightmost = xff?.split(",").at(-1)?.trim();
    if (rightmost) return { ip: normalizeIp(rightmost), source: "xff" };

    // 4) 无代理头（本地直连 3000）
    return { ip: normalizeIp(req.socket?.remoteAddress), source: "socket" };
}
