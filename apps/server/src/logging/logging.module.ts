import { Module, RequestMethod } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { LoggerErrorInterceptor, LoggerModule } from "nestjs-pino";
import { LoggingInterceptor } from "./logging.interceptor";
import { buildPinoHttpOptions } from "./pino-http.options";

@Module({
    imports: [
        LoggerModule.forRoot({
            pinoHttp: buildPinoHttpOptions(),
            forRoutes: [{ path: "*splat", method: RequestMethod.ALL }],
        }),
    ],
    providers: [
        LoggingInterceptor,
        {
            provide: APP_INTERCEPTOR,
            useClass: LoggerErrorInterceptor,
        },
        {
            provide: APP_INTERCEPTOR,
            useExisting: LoggingInterceptor,
        }
    ],
})
export class LoggingModule {}
