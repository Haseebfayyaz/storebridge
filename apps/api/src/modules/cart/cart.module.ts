import { Module } from '@nestjs/common';
import { EventsModule } from 'common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule, EventsModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
