import { Injectable } from '@nestjs/common'

@Injectable()
export class AppService {
  getHello(): { message: string; timestamp: string } {
    return {
      message: 'Hello from NestJS!',
      timestamp: new Date().toISOString(),
    }
  }
}
