import { Controller, Get, Post, InternalServerErrorException } from "@nestjs/common";
import { AppService } from "./app.service";
import { HelloPostDto } from "./app.dto";
import { Body } from "@nestjs/common";

@Controller("hello")
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Get()
    getHello() {
        return this.appService.getHello();
    }

    @Post()
    async getHelloPost(@Body() body: HelloPostDto) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.appService.getHello();
    }

    @Get("_fail")
    fail() {
        throw new InternalServerErrorException("filter path");
    }

    @Get("_carsh")
    carsh() {
        setTimeout(() => {
            throw new Error("timer path");
        }, 0);
        return { ok: true };
    }
    
    @Get("_reject")
    reject() {
        void Promise.reject(new Error("reject path"));
        return { ok: true };
    }
}
