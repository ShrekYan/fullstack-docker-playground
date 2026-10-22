import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { Logger,LoggerErrorInterceptor} from "nestjs-pino";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";


import { AppModule } from "./app.module";

async function bootstrap() {

    const app = await NestFactory.create(AppModule, {
        bufferLogs:true
    });
    
    // logger 配置
    const logger = app.get(Logger);
    app.useLogger(logger);
    app.useGlobalInterceptors(new LoggerErrorInterceptor());
    app.setGlobalPrefix("api");
    app.enableCors({ origin: "*" });

    // 全局验证管道
    app.useGlobalPipes(new ValidationPipe({
      whitelist:true,
      forbidNonWhitelisted:true,
      transform:true
    }));

    // 版本控制
    app.enableVersioning({
        type: VersioningType.URI,
        defaultVersion: "1",
    });

    // pino transport 跑在子线程，SIGTERM 时给框架机会把缓冲日志刷完
    app.enableShutdownHooks();

    const swaggerDocument = new DocumentBuilder().setTitle("React Docker").setDescription("React Docker API").setVersion("1.0").build();
    const document = SwaggerModule.createDocument(app, swaggerDocument);
    SwaggerModule.setup("docs", app, document);
    
    await app.listen(process.env.PORT ?? 3000, "0.0.0.0");
    logger.log(`CorpRAG HTTP service listening on :${process.env.PORT ?? 3000}`);
    logger.log(`Swagger UI available at http://localhost:${process.env.PORT ?? 3000}/docs`);
}
bootstrap();
