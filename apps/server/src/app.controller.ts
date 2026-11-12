import { Controller, Get, Post, InternalServerErrorException, Req,Res,Headers } from "@nestjs/common";
import { Request } from "express";
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

    @Get("_echo")
    echo(@Req() req: Request, @Headers() headers: Record<string, string>) {
        return {
            url: req.url,
            method: req.method,
            headers: {
                host: headers["host"],
                'x-real-ip':headers['x-real-ip'],
                'x-forwarded-for':headers['x-forwarded-for'],
                'x-forwarded-proto':headers['x-forwarded-proto'],
                'user-agent':headers['user-agent'],
            },
        };
    }

    @Get("_slow")
    async slow(){
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        return { message: "finally done" }
    }

    @Get("_drip")
    async drip(@Res() res:any){
        for(let i = 0; i< 5; i++){
            await new Promise((r)=>{setTimeout(r,2_000)});
            res.write(`chunk ${i}\n`);
        }
        return res.end("done");
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
