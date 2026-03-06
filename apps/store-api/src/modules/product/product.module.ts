import { Module } from '@nestjs/common';
import { DatabaseModule } from 'database';
import { ElasticsearchModule } from '../elasticsearch/elasticsearch.module';
import { ProductController } from './product.controller';
import { ProductListingService } from './product-listing.service';
import { ProductService } from './product.service';

@Module({
  imports: [DatabaseModule, ElasticsearchModule],
  controllers: [ProductController],
  providers: [ProductService, ProductListingService],
  exports: [ProductService],
})
export class ProductModule {}
