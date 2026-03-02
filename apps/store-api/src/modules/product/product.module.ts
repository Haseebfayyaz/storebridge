import { Module } from '@nestjs/common';
import { DatabaseModule } from 'database';
import { ElasticsearchModule } from '../elasticsearch/elasticsearch.module';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  imports: [DatabaseModule, ElasticsearchModule],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
