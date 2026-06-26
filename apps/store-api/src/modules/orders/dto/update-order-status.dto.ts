import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsIn([
    'PENDING',
    'ORDER_PLACED',
    'ACCEPTED',
    'PROCESSING',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
  ])
  status!:
    | 'PENDING'
    | 'ORDER_PLACED'
    | 'ACCEPTED'
    | 'PROCESSING'
    | 'SHIPPED'
    | 'DELIVERED'
    | 'CANCELLED';

  @IsOptional()
  @IsString()
  note?: string;
}
