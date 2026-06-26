import { Module } from '@nestjs/common';
import { EventsModule } from 'common';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [InventoryModule, EventsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
