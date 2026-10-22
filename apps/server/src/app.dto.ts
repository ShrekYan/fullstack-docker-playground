import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class HelloPostDto {
    @ApiProperty({ description: "用户名",example:"yanjinqiang" })
    @IsNotEmpty()
    @IsString()
    name: string;

    @ApiProperty({ description: "密码",example:"123456" })
    @IsNotEmpty()
    @IsString()
    password: string;
}
