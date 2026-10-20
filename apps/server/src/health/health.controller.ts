import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService, HealthIndicatorResult, MemoryHealthIndicator } from "@nestjs/terminus";

export class DogHealthIndicator {
    async isHealthy(key: string): Promise<HealthIndicatorResult> {
        const isHealthy = true;
        const result = { [key]: { status: "up" } };
        if (isHealthy) return result as HealthIndicatorResult;
        throw new Error("Dog health check failed");
    }
}

@Controller("health")
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private memory: MemoryHealthIndicator,
        private dog: DogHealthIndicator,
    ) {}

    @Get()
    @HealthCheck()
    check() {
        return this.health.check([
            () => {
                return this.dog.isHealthy("dog");
            },
        ]);
    }

    @Get('liveness')
    @HealthCheck()
    liveness(){
        return this.health.check([]);
    }
}
