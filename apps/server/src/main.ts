import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import {ValidationPipe,VersioningType} from "@nestjs/common"

import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix('api');
  app.enableCors({origin: '*'});
  // app.useGlobalPipes(new ValidationPipe({
  //   whitelist:true,
  //   forbidNonWhitelisted:true,
  //   transform:true
  // }));
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0')
}
bootstrap()
