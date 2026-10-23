/**
 * 中国无夏令时，固定 UTC+8：时刻前移 8 小时，再按 ISO 串截取到毫秒。
 * 返回 YYYY-MM-DD HH:mm:ss.SSS（与网关 access_log 同格式）。
 */
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;

export function formatChinaTime(date: Date = new Date()): string {
    // 2026-10-23T05:34:04.123Z → 前移 8h → 2026-10-23T13:34:04.123Z
    // slice(0, 23) → 2026-10-23T13:34:04.123，再把 T 换成空格
    const iso = new Date(date.getTime() + CHINA_OFFSET_MS).toISOString();
    return iso.slice(0, 23).replace("T", " ");
}

/**
 * pino 自定义 timestamp 函数。
 * pino 要求返回原始 JSON 片段，`,"time":` 前缀必须保留。
 */
export function chinaTime(): string {
    return `,"time":"${formatChinaTime()}"`;
}
