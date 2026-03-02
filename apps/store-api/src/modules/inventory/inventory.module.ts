import { Module } from '@nestjs/common';
import { DatabaseModule } from 'database';
import { ElasticsearchModule } from '../elasticsearch/elasticsearch.module';
import { ProductModule } from '../product/product.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [DatabaseModule, ElasticsearchModule, ProductModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
