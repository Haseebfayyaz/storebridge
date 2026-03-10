import { Module } from '@nestjs/common';
import { DatabaseModule } from 'database';
import { TaxClassController } from './tax-class.controller';
import { TaxClassService } from './tax-class.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TaxClassController],
  providers: [TaxClassService],
})
export class TaxClassModule {}
