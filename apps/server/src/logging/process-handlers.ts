import { hostname } from "node:os";
import type { Logger as PinoLoggerInstance } from "pino";
import { PinoLogger } from "nestjs-pino";
import { storage } from "nestjs-pino/storage";
import { safeTruncate } from "./logging.config";
import { formatChinaTime } from "./time";

type ProcessErrorOrigin = "uncaughtException" | "unhandledRejection";

function normalizeError(value: unknown): Error {
    if (value instanceof Error) return value;
    if (typeof value === "string") return new Error(value);

    try {
        return new Error(JSON.stringify(value));
    } catch {
        return new Error(String(value));
    }
}

/**
 * PinoLogger.root 在 LoggerModule.configure() 中赋值，
 * configure() 发生在 app.init()/app.listen() 内部，必须延迟读取。
 */
function getRootLogger(): PinoLoggerInstance | undefined {
    return PinoLogger.root as PinoLoggerInstance | undefined;
}

/**
 * 优先取请求上下文 logger：nestjs-pino 用 AsyncLocalStorage 把 req.log
 * 绑定到请求生命周期，进程级异常回调里仍能读到（实测 promise/timer 均保留上下文）。
 * 这样日志会带上 req.request_id，可与会话日志串联。
 * 无请求上下文（启动期、定时任务、后台 Promise）时回退 root logger。
 */
function getContextLogger(): PinoLoggerInstance | undefined {
    return storage.getStore()?.logger ?? getRootLogger();
}

/**
 * pino 尚未就绪时写结构化 JSON 到 stderr。
 * 字段与键序对齐 pino 输出：level → time → base(pid/hostname) → payload → msg，
 * time 与 pino 同源（UTC+8、空格分隔、毫秒），采集器只需一种时间 parser。
 */
function writeFallbackToStderr(level: number, payload: Record<string, unknown>, message: string): void {
    process.stderr.write(
        `${JSON.stringify({
            level,
            time: formatChinaTime(),
            pid: process.pid,
            hostname: hostname(),
            ...payload,
            msg: message,
        })}\n`,
    );
}

/**
 * 注册进程级异常处理器：只记录日志，不退出进程。
 * 每次异常都记录，不做指纹限流。
 * 注意：uncaughtException 后进程状态不可信（Node 官方结论），
 * 这里是可用性优先的取舍，生产环境应配合多副本使用。
 */
export function registerProcessErrorHandlers(): void {
    const handle = (origin: ProcessErrorOrigin) => (reason: unknown) => {
        const err = normalizeError(reason);
        // uncaughtException 后进程状态不可信 → fatal；unhandledRejection 未必破坏状态 → error
        const level = origin === "uncaughtException" ? 60 : 50;

        // err 结构与 pino-http 的 customErrorObject 普通 Error 分支一致：
        // 只保留 type/message/stack，并统一走 safeTruncate（2k 上限）
        const payload = {
            event: {
                name: origin === "uncaughtException" ? "process.uncaught_exception" : "process.unhandled_rejection",
            },
            origin,
            err: {
                type: err.name,
                message: safeTruncate(err.message),
                stack: safeTruncate(err.stack),
            },
        };
        const message = `process ${origin} (logged, kept alive)`;

        const logger = getContextLogger();

        // 启动早期 pino 还没就绪：写 stderr，不强制退出
        if (!logger) {
            process.exitCode = 1;
            writeFallbackToStderr(level, payload, `process ${origin} (logger not ready)`);
            return;
        }

        if (origin === "uncaughtException") logger.fatal(payload, message);
        else logger.error(payload, message);
    };

    process.on("uncaughtException", handle("uncaughtException"));
    process.on("unhandledRejection", handle("unhandledRejection"));
}
