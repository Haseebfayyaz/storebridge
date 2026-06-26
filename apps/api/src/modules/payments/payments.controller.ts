import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'auth';
import { Request } from 'express';
import { PaymentsService } from './payments.service';

interface RequestWithUser extends Request {
  user: {
    sub: string;
  };
}

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('orders/:orderId/capture')
  capturePayment(
    @Req() req: RequestWithUser,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentsService.capturePayment(orderId, req.user.sub);
  }

  @Post('orders/:orderId/refund')
  refundPayment(
    @Req() req: RequestWithUser,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentsService.refundPayment(orderId, req.user.sub);
  }
}
