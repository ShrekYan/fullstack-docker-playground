import { Module, RequestMethod } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { HealthModule } from "./health/health.module";
import { LoggerModule } from "nestjs-pino";
import { LoggingInterceptor } from "./logging/logging.interceptor";
import { HEALTH_PREFIX, REDACT_PATHS, generateRequestId } from "./logging/logging.config";

@Module({
    imports: [
        HealthModule,
        LoggerModule.forRoot({
            pinoHttp: {
                level: process.env.LOG_LEVEL ?? "info",
                // 生成请求 ID，用于关联日志和请求
                genReqId: (req, res) => {
                    const id = generateRequestId(req.headers["x-request-id"]);
                    res.setHeader("x-request-id", id);
                    return id;
                },
                redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
                autoLogging: {
                    ignore: (req) => req.url?.startsWith(HEALTH_PREFIX) ?? false,
                },
                customLogLevel: (req, res, err) => {
                    if (err || res?.statusCode >= 500) {
                        return "error";
                    }
                    if (res.statusCode >= 400) {
                        return "warn";
                    }
                    return "info";
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
                                          file: "/app/logs/server.log",
                                          frequency: "daily",
                                          limit: { count: 14 },
                                          mkdir: true,
                                      },
                                      level: process.env.LOG_LEVEL ?? "info",
                                  },
                              ],
                          },
            },
            forRoutes: [{ path: "*splat", method: RequestMethod.ALL }],
        }),
    ],
    controllers: [AppController],
    providers: [
        AppService,
        {
            provide: APP_INTERCEPTOR,
            useClass: LoggingInterceptor,
        },
    ],
})
export class AppModule {}
