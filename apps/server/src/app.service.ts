import { Injectable, Optional, LoggerService } from "@nestjs/common";
import { Logger, PinoLogger } from "nestjs-pino";

@Injectable()
export class AppService {
    constructor(private readonly logger: Logger) {}

    async onApplicationShutdown(signal?: string) {
        // 等待日志写入完成
        if (signal === "SIGTERM") {
            await new Promise<void>((resolve) => {
                PinoLogger.root.flush(() => resolve());
            });
        }
    }
    
    getHello(): { message: string; timestamp: string } {
        return {
            message: "Hello from NestJS!",
            timestamp: new Date().toISOString(),
        };
    }
}
