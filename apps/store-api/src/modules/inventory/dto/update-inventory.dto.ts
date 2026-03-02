import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class UpdateInventoryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  stockQty?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  reservedQty?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  lowStock?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  storePrice?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  storeCostPrice?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  storeMrp?: number;
}
