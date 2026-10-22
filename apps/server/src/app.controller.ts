import { Controller, Get, Post } from "@nestjs/common";
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
    getHelloPost(@Body() body: HelloPostDto) {
        return this.appService.getHello();
    }
}
