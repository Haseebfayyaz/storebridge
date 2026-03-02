import { Module } from '@nestjs/common';
import { DatabaseModule } from 'database';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CategoryController],
  providers: [CategoryService],
})
export class CategoryModule {}