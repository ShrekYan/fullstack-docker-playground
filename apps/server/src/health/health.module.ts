import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'
import { HealthController, DogHealthIndicator } from './health.controller'

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DogHealthIndicator],
})
export class HealthModule {}
