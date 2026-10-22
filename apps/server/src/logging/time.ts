 /**
   * pino 自定义 timestamp 函数。
   * pino 要求返回原始 JSON 片段，`,"time":` 前缀必须保留。
   * 中国无夏令时，固定 UTC+8：先把时刻前移 8 小时，再取 ISO 串里的数字。
   */
  const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;

  export function chinaTime(): string {
      // 2026-10-22T07:07:44.515Z → 前移 8h → 2026-10-22T15:07:44.515Z
      // 去掉 - T : . Z 后得到 20261022150744515，取前 14 位
      const digits = new Date(Date.now() + CHINA_OFFSET_MS)
          .toISOString()
          .replace(/\D/g, "");
      return `,"time":"${digits.slice(0, 14)}"`;   // YYYYMMDDHHmmss
  }