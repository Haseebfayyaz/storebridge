import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService, JwtAuthGuard, LoginDto, SignupDto } from 'auth';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user: {
    sub: string;
  };
}

@Controller('auth')
export class AppAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  profile(@Req() req: RequestWithUser) {
    return this.authService.profile(req.user.sub);
  }
}
