import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  AuthService,
  CustomerSignupDto,
  JwtAuthGuard,
  LoginDto,
  VendorSignupDto,
} from 'auth';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user: {
    sub: string;
  };
}

@Controller('auth')
export class AppAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup/customer')
  signupCustomer(@Body() dto: CustomerSignupDto) {
    return this.authService.signupCustomer(dto);
  }

  @Post('signup/vendor')
  signupVendor(@Body() dto: VendorSignupDto) {
    return this.authService.signupVendor(dto);
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
