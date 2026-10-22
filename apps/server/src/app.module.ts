import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { HealthModule } from "./health/health.module";
import { LoggingModule } from "./logging/logging.module";

@Module({
    imports: [
        HealthModule,
        LoggingModule,
    ],
    controllers: [AppController],
    providers: [
        AppService
    ]
})
export class AppModule {}
